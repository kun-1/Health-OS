import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { expenseReceiptImages, expenseReceipts } from "@/db/schema";
import {
  ensureReceiptDirs,
  extensionForMimeType,
  generateReceiptFilename,
  generateReceiptThumbnail
} from "@/lib/expenses/images";
import { sha256OfBuffer } from "@/lib/expenses/hashing";
import { reprocessExpenseReceipt } from "@/lib/expenses/receipt-jobs";
import {
  addReceiptImages,
  getExpenseReceipt,
  getReceiptByHash,
  recordReceiptHash
} from "@/lib/expenses/store";
import { and, eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
// Hard cap on the COMBINED image count for a single receipt, including any
// already-stored images. 2 matches the upload route cap and the proven
// MiniMax OCR budget — 3+ images blew past the 300s request timeout.
const MAX_IMAGES_PER_RECEIPT = 2;
const maxFileBytes = 8 * 1024 * 1024;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId) || receiptId <= 0) {
    return NextResponse.json({ error: "Invalid receipt id" }, { status: 400 });
  }

  // Only pending_review receipts accept new images. Confirmed receipts have
  // a transaction that points at the receipt; touching the receipt's image
  // set after confirmation would silently drift the transaction away from
  // the OCR snapshot the user already approved.
  let receipt;
  try {
    receipt = getExpenseReceipt(receiptId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Receipt not found" },
      { status: 404 }
    );
  }
  if (receipt.status !== "pending_review" || receipt.transaction_id) {
    return NextResponse.json(
      { error: "Only pending review receipts can accept more images" },
      { status: 400 }
    );
  }

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("receipts") ?? []).filter((file): file is File => file instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "receipt image is required" }, { status: 400 });
  }
  const remainingSlots = MAX_IMAGES_PER_RECEIPT - receipt.images.length;
  if (remainingSlots <= 0) {
    return NextResponse.json(
      { error: `该票据已有 ${receipt.images.length} 张图片，已达上限 ${MAX_IMAGES_PER_RECEIPT}` },
      { status: 400 }
    );
  }
  if (files.length > remainingSlots) {
    return NextResponse.json(
      { error: `当前票据已有 ${receipt.images.length} 张，本次最多再添加 ${remainingSlots} 张` },
      { status: 400 }
    );
  }

  const staged: Array<{ bytes: Buffer; mimeType: string; filename: string; hash: string }> = [];
  const seenHashes = new Set<string>();
  for (const file of files) {
    if (!allowedMimeTypes.has(file.type)) {
      return NextResponse.json(
        { error: `${file.name}: only jpeg, png, and webp images are supported` },
        { status: 400 }
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.byteLength > maxFileBytes) {
      return NextResponse.json(
        { error: `${file.name}: receipt image must be 8MB or smaller` },
        { status: 400 }
      );
    }
    const hash = sha256OfBuffer(bytes);
    if (seenHashes.has(hash)) {
      return NextResponse.json({ error: `${file.name}: duplicate image in this request` }, { status: 409 });
    }
    seenHashes.add(hash);
    const existingReceipt = getReceiptByHash(hash);
    if (existingReceipt && existingReceipt.id !== receiptId) {
      return NextResponse.json(
        {
          error: "Duplicate image",
          existingReceiptId: existingReceipt.id,
          message: "This image was already uploaded. Open the existing receipt instead."
        },
        { status: 409 }
      );
    }
    staged.push({ bytes, mimeType: file.type, filename: file.name, hash });
  }

  const existingHashes = new Set<string>();
  for (const image of receipt.images) {
    try {
      existingHashes.add(sha256OfBuffer(await fs.readFile(image.image_path)));
    } catch {
      // Missing existing files are handled by reprocessExpenseReceipt below.
    }
  }
  for (const file of staged) {
    if (existingHashes.has(file.hash)) {
      return NextResponse.json({ error: `${file.filename}: image is already attached to this receipt` }, { status: 409 });
    }
  }

  const receiptsDir = path.join(process.cwd(), "data", "expense-receipts");
  await ensureReceiptDirs();

  // Write new files to disk and append them to the sub-table. We do this
  // BEFORE re-OCR so the worker (reprocessExpenseReceipt) sees the complete
  // set via getReceiptImageInputs. If the disk write fails halfway, we
  // haven't yet touched the DB — the user can retry safely.
  const saved: Array<{ imagePath: string; imageMimeType: string }> = [];
  for (const file of staged) {
    const filename = generateReceiptFilename(extensionForMimeType(file.mimeType));
    const imagePath = path.join(receiptsDir, "originals", filename);
    await fs.writeFile(imagePath, file.bytes);
    saved.push({ imagePath, imageMimeType: file.mimeType });
  }

  addReceiptImages(receiptId, saved);

  // Refresh the parent row's first-image pointer in case the user uploaded
  // new images but receipt.images is empty (shouldn't happen post-
  // migration, but defensive). generateReceiptThumbnail returns null on
  // failure; we don't fail the request — the user can still edit.
  if (receipt.images.length === 0) {
    const firstThumb = await generateReceiptThumbnail(saved[0].imagePath);
    if (firstThumb) {
      db.update(expenseReceipts)
        .set({ thumbnailPath: firstThumb, updatedAt: new Date().toISOString() })
        .where(eq(expenseReceipts.id, receiptId))
        .run();
    }
  }

  // Re-OCR synchronously so the client gets the updated extraction in the
  // response. reprocessExpenseReceipt loads all images (existing + newly
  // added) and sends them as a single N-image call to the OCR provider.
  // The response shape mirrors the original /receipts/[id]/route PATCH so
  // the client can update its draft state from `receipt.extracted`.
  const startedAt = performance.now();
  try {
    const result = await reprocessExpenseReceipt(receiptId);
    for (const file of staged) {
      try {
        recordReceiptHash(receiptId, file.hash);
      } catch {
        // Secondary dedup index; the receipt itself already saved.
      }
    }
    return NextResponse.json({
      receipt: result.receipt,
      timing: result.timing,
      total_ms: elapsedSince(startedAt)
    });
  } catch (error) {
    const savedPaths = saved.map((image) => image.imagePath);
    if (savedPaths.length > 0) {
      db.delete(expenseReceiptImages)
        .where(and(eq(expenseReceiptImages.receiptId, receiptId), inArray(expenseReceiptImages.imagePath, savedPaths)))
        .run();
      await Promise.all(savedPaths.map((imagePath) => fs.unlink(imagePath).catch(() => undefined)));
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Re-OCR failed after adding images",
        // Best-effort: return the original receipt state; newly-added image
        // rows/files are rolled back above when OCR fails.
        receipt: getExpenseReceipt(receiptId)
      },
      { status: 500 }
    );
  }
}
