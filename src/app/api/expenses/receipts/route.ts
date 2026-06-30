import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

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
// Wave 3 multi-image: cap at 2 images per OCR call. We tried 3 but the
// MiniMax thinking pass blew past the 300s request budget on a typical
// 2-screenshot Hema order (16+ items, 1100+ second hangs). 2 is the
// proven safe limit — the test upload produced 16 items in ~180s.
const maxFilesPerRequest = 2;
const maxFileBytes = 8 * 1024 * 1024;

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

type UploadedFile = {
  filename: string;
  bytes: Buffer;
  mimeType: string;
};

export async function POST(request: NextRequest) {
  const requestStartedAt = performance.now();
  const form = await request.formData().catch(() => null);
  // Wave 1 review fix (C1): reject any request that uses a key other than
  // "receipts" before counting files. Same rule for the multi-image flow —
  // the client must use "receipts" only.
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
    return NextResponse.json(
      { error: `一次最多上传 ${maxFilesPerRequest} 张票据，避免视觉模型请求排队过久` },
      { status: 400 }
    );
  }

  // Wave 3 multi-image: stage every file in memory before touching the disk
  // so we can validate + dedup the WHOLE batch first. This avoids the
  // previous behavior where each iteration would write its file to disk
  // and only THEN hit the duplicate check, leaving orphan files when a
  // later file was a duplicate. Now we dedup everything, then write only
  // the survivors.
  const staged: UploadedFile[] = [];
  const failures: { filename?: string; error: string }[] = [];
  const timings: { filename: string; size_bytes: number; read_ms: number; total_ms: number }[] = [];

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
    staged.push({ filename: file.name, bytes, mimeType: file.type });
    timings.push({
      filename: file.name,
      size_bytes: bytes.byteLength,
      read_ms: readMs,
      total_ms: elapsedSince(fileStartedAt)
    });
  }

  if (staged.length === 0) {
    // Nothing survived validation. Return 400 with the validation errors so
    // the UI can surface them inline (mirrors the single-file failure path).
    return NextResponse.json(
      { error: "没有可用的票据图片", failures, timings, total_ms: elapsedSince(requestStartedAt) },
      { status: 400 }
    );
  }

  // Wave 3 dedup: SHA-256 each file individually. We abort the WHOLE upload
  // (with 409) on the FIRST duplicate — same semantic as the single-file
  // flow. The user can open the existing receipt, remove it, and re-upload.
  // Note: the actual receipt identity is the per-receipt set, but for the
  // simple "did the user re-upload the same screenshot" check, per-file
  // hashing is sufficient and cheap.
  for (const file of staged) {
    const hash = sha256OfBuffer(file.bytes);
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
  }

  // Wave 2 feature: image compression — originals go under originals/,
  // thumbs go under thumbs/. The file-serving route resolves both via its
  // traversal guard.
  const receiptsDir = path.join(process.cwd(), "data", "expense-receipts");
  await ensureReceiptDirs();

  // Persist files in upload order so positions in expense_receipt_images /
  // expense_receipt_jobs.image_paths_json match what the user uploaded.
  const saved: Array<{ imagePath: string; imageMimeType: string; originalFilename: string }> = [];
  for (const file of staged) {
    const saveStartedAt = performance.now();
    const filename = generateReceiptFilename(extensionForMimeType(file.mimeType));
    const imagePath = path.join(receiptsDir, "originals", filename);
    await fs.writeFile(imagePath, file.bytes);
    timings.push({
      filename: file.filename,
      size_bytes: file.bytes.byteLength,
      read_ms: 0,
      total_ms: elapsedSince(saveStartedAt)
    });
    saved.push({ imagePath, imageMimeType: file.mimeType, originalFilename: file.filename });
  }

  // One job per upload, N image paths inside the job's JSON column. The
  // worker reads the JSON and runs a single OCR call across all of them.
  const firstFile = saved[0];
  const job = createReceiptJob({
    imagePath: firstFile.imagePath,
    imageMimeType: firstFile.imageMimeType,
    imagePaths: saved.map((entry) => ({ path: entry.imagePath, mime: entry.imageMimeType })),
    originalFilename:
      saved.length === 1 ? firstFile.originalFilename : `${firstFile.originalFilename} + ${saved.length - 1} 张`
  });

  // Wave 3 worker: OCR no longer blocks the upload. We file the job in the
  // queue (createReceiptJob already marks it 'queued' with next_attempt_at =
  // now) and hand it to setImmediate so the HTTP response returns within
  // milliseconds, dodging reverse-proxy timeouts. If the worker dies
  // between setImmediate and the OCR call, the scheduler tick will pick
  // the job back up.
  setImmediate(() => {
    processExpenseReceiptJob(job.id)
      .then(async (result) => {
        // Wave 2 feature: image compression — write thumbnail_path onto the
        // receipt after OCR succeeded. We do this here rather than in the
        // worker because the receipt's sub-table image rows already exist by
        // the time we return from processExpenseReceiptJob (createReceipt
        // inserts them), but the thumbnail for the FIRST image is the one
        // the parent receipt row needs. For multi-image receipts we keep
        // thumbnail_path on the parent for legacy compat; the carousel UI
        // renders each image at full size (we don't generate per-image
        // thumbs for now — added complexity, no measurable UX win).
        if (!("error" in result) && saved.length > 0) {
          // Generate (or re-generate) the first image's thumbnail and
          // attach it to the receipt. Done asynchronously so the worker
          // doesn't block on sharp.
          const firstPath = saved[0].imagePath;
          const thumb = await generateReceiptThumbnail(firstPath);
          if (thumb) {
            const { db } = await import("@/lib/db");
            const { expenseReceipts } = await import("@/db/schema");
            const { eq } = await import("drizzle-orm");
            db.update(expenseReceipts)
              .set({ thumbnailPath: thumb })
              .where(eq(expenseReceipts.id, result.receipt.id))
              .run();
          }
        }
      })
      .catch((error) => {
        console.error("[expenses:upload-bg]", {
          jobId: job.id,
          filenames: saved.map((entry) => entry.originalFilename),
          error: error instanceof Error ? error.message : String(error)
        });
      });
  });

  return NextResponse.json(
    {
      jobs: [job],
      failures,
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