import fs from "node:fs/promises";

import { generateReceiptThumbnail } from "@/lib/expenses/images";
import { extractReceiptWithOpenRouter } from "@/lib/expenses/ocr";
import { sha256OfBuffer } from "@/lib/expenses/hashing";
import {
  createReceipt,
  getExpenseReceipt,
  getExpenseReceiptJob,
  markReceiptJobCompleted,
  markReceiptJobFailed,
  markReceiptJobProcessing,
  replaceExpenseReceiptExtraction
} from "@/lib/expenses/store";

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export async function processExpenseReceiptJob(jobId: number) {
  const initialJob = getExpenseReceiptJob(jobId);
  const job = markReceiptJobProcessing(initialJob.id);
  const startedAt = performance.now();

  try {
    const readStartedAt = performance.now();
    const bytes = await fs.readFile(job.image_path);
    const readMs = elapsedSince(readStartedAt);

    const encodeStartedAt = performance.now();
    const imageBase64 = bytes.toString("base64");
    const encodeMs = elapsedSince(encodeStartedAt);
    // Wave 3 dedup: hash the bytes the worker is about to OCR. The upload
    // route already ran a hash check, but the worker re-hashes so the
    // receipt_hashes row gets written by the same code path that creates
    // the receipt (single source of truth = createReceipt's optional
    // contentHash argument). Cheap — SHA-256 on the buffer we already have.
    const contentHash = sha256OfBuffer(bytes);

    const ocrStartedAt = performance.now();
    const ocr = await extractReceiptWithOpenRouter({
      imageBase64,
      mimeType: job.image_mime_type
    });
    const ocrMs = elapsedSince(ocrStartedAt);

    const dbStartedAt = performance.now();
    const thumbnailPath = await generateReceiptThumbnail(job.image_path);
    const receipt = createReceipt({
      imagePath: job.image_path,
      imageMimeType: job.image_mime_type,
      rawModelJson: ocr.raw,
      extracted: ocr.extracted,
      thumbnailPath,
      contentHash
    });
    const dbMs = elapsedSince(dbStartedAt);

    const completedJob = markReceiptJobCompleted(job.id, receipt.id);
    const timing = {
      filename: job.original_filename,
      size_bytes: bytes.byteLength,
      provider: ocr.provider,
      model: ocr.model,
      total_ms: elapsedSince(startedAt),
      read_ms: readMs,
      encode_ms: encodeMs,
      ocr_ms: ocrMs,
      db_ms: dbMs,
      provider_timings: ocr.timings
    };
    console.info("[expenses:receipt-job:timing]", timing);
    return { job: completedJob, receipt, timing };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt OCR failed";
    const failedJob = markReceiptJobFailed(job.id, message);
    console.error("[expenses:receipt-job]", {
      error: message,
      imagePath: job.image_path,
      total_ms: elapsedSince(startedAt)
    });
    return {
      job: failedJob,
      error: message,
      timing: {
        filename: job.original_filename,
        total_ms: elapsedSince(startedAt)
      }
    };
  }
}

export async function reprocessExpenseReceipt(receiptId: number) {
  const receipt = getExpenseReceipt(receiptId);
  const startedAt = performance.now();

  const readStartedAt = performance.now();
  const bytes = await fs.readFile(receipt.image_path);
  const readMs = elapsedSince(readStartedAt);

  const encodeStartedAt = performance.now();
  const imageBase64 = bytes.toString("base64");
  const encodeMs = elapsedSince(encodeStartedAt);

  const ocrStartedAt = performance.now();
  const ocr = await extractReceiptWithOpenRouter({
    imageBase64,
    mimeType: receipt.image_mime_type
  });
  const ocrMs = elapsedSince(ocrStartedAt);

  const dbStartedAt = performance.now();
  const thumbnailPath = receipt.thumbnail_path ?? (await generateReceiptThumbnail(receipt.image_path));
  const updated = replaceExpenseReceiptExtraction(receipt.id, {
    rawModelJson: ocr.raw,
    extracted: ocr.extracted,
    thumbnailPath
  });
  const dbMs = elapsedSince(dbStartedAt);

  const timing = {
    receipt_id: receipt.id,
    provider: ocr.provider,
    model: ocr.model,
    total_ms: elapsedSince(startedAt),
    read_ms: readMs,
    encode_ms: encodeMs,
    ocr_ms: ocrMs,
    db_ms: dbMs,
    provider_timings: ocr.timings
  };
  console.info("[expenses:receipt-reprocess:timing]", timing);
  return { receipt: updated, timing };
}
