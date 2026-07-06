import fs from "node:fs/promises";

import { generateReceiptThumbnail, prepareReceiptForOcr } from "@/lib/expenses/images";
import { extractReceiptWithReconciliation, OcrError } from "@/lib/expenses/ocr";
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

// Re-export so the upload API route and any other caller can identify
// an OCR-module failure (and pull traceId / streamStats off it) without
// reaching into @/lib/expenses/ocr directly.
export { OcrError };

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

// Wave 3 multi-image: read every image file the job references, preprocess
// each one through sharp, and assemble the N-image payload the OCR layer
// expects. The same hash-input bytes (raw uploads, NOT preprocessed) are
// concatenated into a single SHA-256 so re-uploading the same set of images
// in the same order dedups; we never use the preprocessed bytes for hashing
// because sharp can be lossy on edge cases (EXIF rotation, WebP re-encode).
//
// Returns one entry per image. The order matches `job.image_paths`, which
// preserves the user's upload order so the model sees screenshots in the
// intended sequence.
async function loadJobImagesForOcr(
  job: { image_path: string; image_mime_type: string; image_paths: Array<{ path: string; mime: string }> }
): Promise<{
  images: Array<{ imagePath: string; imageMimeType: string; thumbnailPath: string | null }>;
  prepped: Array<{ base64: string; mimeType: string }>;
  contentHash: string;
  contentHashes: string[];
  prepMs: number;
  prepBytesByImage: number[];
  prepMimesByImage: string[];
  readMs: number;
}> {
  const readStartedAt = performance.now();
  // Read every image's bytes up front. Doing this in one pass lets the
  // prepped[] base64 payload match the raw bytes we hashed (no skew between
  // "what we sent to OCR" and "what we hashed").
  const imageBuffers: Array<{ bytes: Buffer; mime: string; path: string }> = [];
  for (const entry of job.image_paths) {
    const bytes = await fs.readFile(entry.path);
    imageBuffers.push({ bytes, mime: entry.mime, path: entry.path });
  }
  const readMs = elapsedSince(readStartedAt);

  // Hash the concatenated raw bytes. We use a length-prefixed concat so a
  // pair (A, B) hashes differently from (A+B, "") — without the prefix,
  // { "abc", "def" } and { "abcd", "ef" } would produce the same hash.
  const hashInput = Buffer.concat(
    imageBuffers.flatMap(({ bytes }) => [Buffer.from(String(bytes.byteLength)), bytes])
  );
  const contentHash = sha256OfBuffer(hashInput);
  const contentHashes = imageBuffers.map(({ bytes }) => sha256OfBuffer(bytes));

  const prepStartedAt = performance.now();
  const prepResults = await Promise.all(
    imageBuffers.map(async ({ bytes, mime }) => {
      const prep = await prepareReceiptForOcr(bytes, mime);
      return prep.buffers.map((buffer) => ({ buffer, mimeType: prep.mimeType }));
    })
  );
  const prepMs = elapsedSince(prepStartedAt);
  const flatPrepped = prepResults.flat();
  const prepBytesByImage = prepResults.map((buffers) =>
    buffers.reduce((sum, b) => sum + b.buffer.byteLength, 0)
  );
  const prepMimesByImage = prepResults.map((buffers) => buffers[0]?.mimeType ?? "image/jpeg");
  const prepped = flatPrepped.map((prep) => ({
    base64: prep.buffer.toString("base64"),
    mimeType: prep.mimeType
  }));

  // Thumbnails are generated from the original bytes (NOT preprocessed) so
  // we get a clean webp at 512px max edge, regardless of what the OCR
  // pipeline does. Failure is non-fatal — the receipt still saves, just
  // without a thumbnail.
  const thumbnails = await Promise.all(
    imageBuffers.map(async ({ path }) => generateReceiptThumbnail(path))
  );

  return {
    images: imageBuffers.map(({ path, mime }, index) => ({
      imagePath: path,
      imageMimeType: mime,
      thumbnailPath: thumbnails[index] ?? null
    })),
    prepped,
    contentHash,
    contentHashes,
    prepMs,
    prepBytesByImage,
    prepMimesByImage,
    readMs
  };
}

export async function processExpenseReceiptJob(jobId: number) {
  const initialJob = getExpenseReceiptJob(jobId);
  const job = markReceiptJobProcessing(initialJob.id);
  const startedAt = performance.now();
  // One traceId per job, threaded into every [expenses:ocr:*] line so the
  // upload endpoint, scheduler tick, and OCR module all share a single
  // grep-able identifier. Used by the failure log below to cross-link to
  // the detailed stream progress (or to ask the user to grep).
  const traceId = `job-${job.id}`;

  try {
    // Pre-flight check #1: catch the legacy / corrupted case where
    // parseJobImagePaths returned an empty array (logged loudly from
    // store.ts but not thrown, so a single bad row doesn't poison the
    // scheduler queue). Failing fast here gives a clear "no images
    // configured" error instead of "images array is empty" 300s later.
    if (job.image_paths.length === 0) {
      throw new Error(
        `Receipt job ${job.id} has no usable image paths (image_path=${JSON.stringify(job.image_path)}, image_mime_type=${JSON.stringify(job.image_mime_type)}). Check the [expenses:store] error logged when this job was loaded.`
      );
    }
    // Pre-flight check #2: confirm every image file is on disk BEFORE
    // we spend 300s talking to MiniMax. Without this, a missing file
    // (orphaned by a manual cleanup, or removed between retries)
    // bubbles up as an opaque ENOENT from sharp — useless for debugging.
    // The check is cheap (fs.stat per image, no body I/O) and
    // short-circuits the OCR call with a self-describing error.
    const missingFiles: string[] = [];
    for (const entry of job.image_paths) {
      try {
        await fs.stat(entry.path);
      } catch {
        missingFiles.push(entry.path);
      }
    }
    if (missingFiles.length > 0) {
      throw new Error(
        `${missingFiles.length}/${job.image_paths.length} image files missing on disk: ${missingFiles.join(", ")}`
      );
    }

    const loaded = await loadJobImagesForOcr(job);
    const encodeStartedAt = performance.now();
    const encodeMs = elapsedSince(encodeStartedAt);

    const ocrStartedAt = performance.now();
    const ocr = await extractReceiptWithReconciliation({
      images: loaded.prepped.map((image) => ({ base64: image.base64, mimeType: image.mimeType })),
      traceId
    });
    const ocrMs = elapsedSince(ocrStartedAt);

    const dbStartedAt = performance.now();
    const receipt = createReceipt({
      imagePath: job.image_path,
      imageMimeType: job.image_mime_type,
      rawModelJson: ocr.raw,
      extracted: ocr.extracted,
      thumbnailPath: loaded.images[0]?.thumbnailPath ?? null,
      contentHash: loaded.contentHash,
      contentHashes: loaded.contentHashes,
      images: loaded.images
    });
    const dbMs = elapsedSince(dbStartedAt);

    const completedJob = markReceiptJobCompleted(job.id, receipt.id);
    // We don't track raw byte size after reading; the prep pipeline emits
    // post-sharp sizes, which are enough for timing diagnostics.
    const totalReadBytes = 0;
    const timing = {
      filename: job.original_filename,
      image_count: job.image_paths.length,
      trace_id: traceId,
      total_ms: elapsedSince(startedAt),
      read_ms: loaded.readMs,
      prep_ms: loaded.prepMs,
      prep_bytes_per_image: loaded.prepBytesByImage,
      prep_mimes: loaded.prepMimesByImage,
      encode_ms: encodeMs,
      ocr_ms: ocrMs,
      db_ms: dbMs,
      provider: ocr.provider,
      model: ocr.model,
      provider_timings: ocr.timings,
      total_read_bytes_approx: totalReadBytes,
      stream_stats: ocr.streamStats
    };
    console.info("[expenses:receipt-job:timing]", timing);
    return { job: completedJob, receipt, timing };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt OCR failed";
    const failedJob = markReceiptJobFailed(job.id, message);
    // OcrError carries the traceId, the failing stage (config / request /
    // response / stream:timeout / stream:payload / parse), and the full
    // StreamStats snapshot — exactly what was missing from the original
    // 3-line failure log. Surface all of it so a single
    // [expenses:receipt-job] line tells the full story.
    const ocrErrorFields =
      error instanceof OcrError
        ? {
            trace_id: error.traceId,
            ocr_stage: error.stage,
            request_meta: error.requestMeta,
            response_meta: error.responseMeta,
            stream_stats: error.streamStats
          }
        : { trace_id: traceId };
    console.error("[expenses:receipt-job]", {
      error: message,
      // image_paths used to be just the path strings (key: imagePaths).
      // That was easy to mistake for "no images" if all entries were
      // empty strings or the array was short. Surface the full
      // {path, mime} entries, the legacy single-image fields, and the
      // count so an empty array is unambiguously "no images configured"
      // rather than "files missing on disk".
      image_count: job.image_paths.length,
      image_paths: job.image_paths,
      legacy_image_path: job.image_path,
      legacy_image_mime_type: job.image_mime_type,
      total_ms: elapsedSince(startedAt),
      ...ocrErrorFields
    });
    return {
      job: failedJob,
      error: message,
      timing: {
        filename: job.original_filename,
        image_count: job.image_paths.length,
        total_ms: elapsedSince(startedAt)
      }
    };
  }
}

export async function reprocessExpenseReceipt(receiptId: number) {
  const receipt = getExpenseReceipt(receiptId);
  const startedAt = performance.now();
  // Trace id ties the reprocess's [expenses:ocr:*] lines to this receipt
  // id. Prefixed "reproc-" so a grep for the receipt id alone doesn't
  // match unrelated new uploads that happen to share numeric suffixes.
  const traceId = `reproc-${receipt.id}`;

  // Wave 3 multi-image: rebuild a synthetic "job-shaped" object so we can
  // reuse loadJobImagesForOcr. The receipt owns its images via the sub-table
  // (loadImagesForOneReceipt), so the legacy receipt.image_path /
  // receipt.image_mime_type fields are only used as the canonical "first
  // image" marker. We DON'T touch those — they're for back-compat.
  const jobShape = {
    image_path: receipt.image_path,
    image_mime_type: receipt.image_mime_type,
    image_paths: receipt.images.length > 0
      ? receipt.images.map((image) => ({ path: image.image_path, mime: image.image_mime_type }))
      : [{ path: receipt.image_path, mime: receipt.image_mime_type }]
  };
  // Same pre-flight checks as processExpenseReceiptJob.
  if (jobShape.image_paths.length === 0) {
    throw new Error(
      `Receipt ${receipt.id} has no usable image paths (image_path=${JSON.stringify(receipt.image_path)}, image_mime_type=${JSON.stringify(receipt.image_mime_type)})`
    );
  }
  const missingFiles: string[] = [];
  for (const entry of jobShape.image_paths) {
    try {
      await fs.stat(entry.path);
    } catch {
      missingFiles.push(entry.path);
    }
  }
  if (missingFiles.length > 0) {
    throw new Error(
      `${missingFiles.length}/${jobShape.image_paths.length} image files missing on disk: ${missingFiles.join(", ")}`
    );
  }

  const loaded = await loadJobImagesForOcr(jobShape);
  const encodeStartedAt = performance.now();
  const encodeMs = elapsedSince(encodeStartedAt);

  const ocrStartedAt = performance.now();
  const ocr = await extractReceiptWithReconciliation({
    images: loaded.prepped.map((image) => ({ base64: image.base64, mimeType: image.mimeType })),
    traceId
  });
  const ocrMs = elapsedSince(ocrStartedAt);

  const dbStartedAt = performance.now();
  // Wave 2 feature: image compression — prefer the existing thumbnail so
  // reprocess doesn't bust the user's edited annotation timing (the
  // thumbnail isn't user-visible in reprocess flow but is still on disk).
  const thumbnailPath =
    receipt.thumbnail_path ?? loaded.images[0]?.thumbnailPath ?? null;
  const updated = replaceExpenseReceiptExtraction(receipt.id, {
    rawModelJson: ocr.raw,
    extracted: ocr.extracted,
    thumbnailPath
  });
  const dbMs = elapsedSince(dbStartedAt);

  const timing = {
    receipt_id: receipt.id,
    trace_id: traceId,
    image_count: jobShape.image_paths.length,
    total_ms: elapsedSince(startedAt),
    read_ms: loaded.readMs,
    prep_ms: loaded.prepMs,
    prep_bytes_per_image: loaded.prepBytesByImage,
    prep_mimes: loaded.prepMimesByImage,
    encode_ms: encodeMs,
    ocr_ms: ocrMs,
    db_ms: dbMs,
    provider: ocr.provider,
    model: ocr.model,
    provider_timings: ocr.timings,
    stream_stats: ocr.streamStats
  };
  console.info("[expenses:receipt-reprocess:timing]", timing);
  return { receipt: updated, timing };
}
