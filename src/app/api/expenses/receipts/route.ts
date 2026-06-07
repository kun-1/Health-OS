import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { expenseReceipts } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ensureReceiptDirs,
  extensionForMimeType,
  generateReceiptFilename,
  generateReceiptThumbnail
} from "@/lib/expenses/images";
import { processExpenseReceiptJob } from "@/lib/expenses/receipt-jobs";
import { createReceiptJob, getReceiptByHash, listExpenseReceipts } from "@/lib/expenses/store";
import { sha256OfBuffer } from "@/lib/expenses/hashing";

export const runtime = "nodejs";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxFilesPerRequest = 2;
const maxFileBytes = 8 * 1024 * 1024;

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export async function POST(request: NextRequest) {
  const requestStartedAt = performance.now();
  const form = await request.formData().catch(() => null);
  // Wave 1 review fix (C1): reject any request that uses a key other than
  // "receipts" before counting files. Previously we merged getAll("receipts")
  // and getAll("receipt") which let a misbehaving client send 2 + 2 = 4 files
  // past the maxFilesPerRequest cap. The client must use "receipts" only.
  const allKeys = new Set<string>();
  for (const key of form?.keys() ?? []) allKeys.add(key);
  if (allKeys.size > 1 || (allKeys.size === 1 && !allKeys.has("receipts"))) {
    return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
  }
  const files = (form?.getAll("receipts") ?? []).filter((file): file is File => file instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "receipt image is required" }, { status: 400 });
  }
  if (files.length > maxFilesPerRequest) {
    return NextResponse.json({ error: `一次最多上传 ${maxFilesPerRequest} 张票据，避免视觉模型请求排队过久` }, { status: 400 });
  }

  const receipts: unknown[] = [];
  const failures: { filename?: string; error: string; imagePath?: string; job?: unknown; timing?: unknown }[] = [];
  const jobs: unknown[] = [];
  const timings: unknown[] = [];

  // Wave 2 feature: image compression — originals go under originals/, thumbs
  // go under thumbs/. The file-serving route resolves both via its traversal
  // guard.
  const receiptsDir = path.join(process.cwd(), "data", "expense-receipts");
  await ensureReceiptDirs();

  for (const file of files) {
    const fileStartedAt = performance.now();
    if (!allowedMimeTypes.has(file.type)) {
      failures.push({ filename: file.name, error: "Only jpeg, png, and webp images are supported" });
      continue;
    }

    const readStartedAt = performance.now();
    const bytes = Buffer.from(await file.arrayBuffer());
    const readMs = elapsedSince(readStartedAt);
    if (bytes.byteLength > maxFileBytes) {
      failures.push({ filename: file.name, error: "Receipt image must be 8MB or smaller" });
      continue;
    }

    // Wave 3 dedup: SHA-256 dedup against the receipt_hashes table. We abort
    // the whole request with 409 on the first duplicate — the UI shows the
    // existing receipt id and the user can either open that receipt or
    // remove the duplicate and resubmit. The bytes-to-disk write below is
    // skipped for duplicates, so no orphan file is left behind.
    const hash = sha256OfBuffer(bytes);
    const existing = getReceiptByHash(hash);
    if (existing) {
      return NextResponse.json(
        {
          error: "Duplicate image",
          existingReceiptId: existing.id,
          message: "This image was already uploaded. Open the existing receipt instead."
        },
        { status: 409 }
      );
    }

    const filename = generateReceiptFilename(extensionForMimeType(file.type));
    const imagePath = path.join(receiptsDir, "originals", filename);
    const saveStartedAt = performance.now();
    await fs.writeFile(imagePath, bytes);
    const saveMs = elapsedSince(saveStartedAt);
    // Wave 2 feature: image compression — generate thumbnail alongside the
    // original. On failure (corrupt file, unsupported format) we fall back
    // to null and the UI uses the original.
    const thumbnailPath = await generateReceiptThumbnail(imagePath);

    const job = createReceiptJob({
      imagePath,
      imageMimeType: file.type,
      originalFilename: file.name
    });
    jobs.push(job);

    // Wave 3 worker: OCR no longer blocks the upload. We file the job in the
    // queue (createReceiptJob already marks it 'queued' with next_attempt_at =
    // now) and hand it to setImmediate so the HTTP response returns within
    // milliseconds, dodging reverse-proxy timeouts. If the worker dies
    // between setImmediate and the OCR call, the scheduler tick (every
    // SCHEDULER_OCR_INTERVAL_MS) will pick the job back up.
    const baseTiming = {
      filename: file.name,
      size_bytes: bytes.byteLength,
      read_ms: readMs,
      save_ms: saveMs,
      total_ms: elapsedSince(fileStartedAt)
    };
    timings.push(baseTiming);
    setImmediate(() => {
      processExpenseReceiptJob(job.id)
        .then((result) => {
          // Wave 2 feature: image compression — the original sync handler
          // wrote thumbnail_path onto the receipt after OCR succeeded. The
          // background path can't do that inline (no receipt.id yet at
          // response time), so we do it here once the receipt exists.
          if (thumbnailPath && !("error" in result)) {
            db.update(expenseReceipts)
              .set({ thumbnailPath })
              .where(eq(expenseReceipts.id, result.receipt.id))
              .run();
          }
        })
        .catch((error) => {
          console.error("[expenses:upload-bg]", {
            jobId: job.id,
            filename: file.name,
            error: error instanceof Error ? error.message : String(error)
          });
        });
    });
  }

  return NextResponse.json(
    {
      receipts,
      failures,
      jobs,
      timings,
      total_ms: elapsedSince(requestStartedAt),
      status: "queued"
    },
    { status: 202 }
  );
}

export async function GET() {
  return NextResponse.json({ receipts: listExpenseReceipts(30) });
}
