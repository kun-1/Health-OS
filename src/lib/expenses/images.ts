import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

// Wave 2 feature: image compression — generate a webp thumbnail (longest edge
// 512px, quality 80). Caller passes the original on-disk path; we write a
// sibling file under the thumbs/ subdir and return its path. On any failure
// we log and return null so the caller can fall back to the original.
const THUMB_LONGEST_EDGE = 512;
const THUMB_QUALITY = 80;

const RECEIPTS_DIR = path.join(process.cwd(), "data", "expense-receipts");
const ORIGINALS_DIR = path.join(RECEIPTS_DIR, "originals");
const THUMBS_DIR = path.join(RECEIPTS_DIR, "thumbs");

export const RECEIPT_ORIGINALS_DIR = ORIGINALS_DIR;
export const RECEIPT_THUMBS_DIR = THUMBS_DIR;

export function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function generateReceiptFilename(extension: string): string {
  return `${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

export async function ensureReceiptDirs(): Promise<void> {
  await fs.mkdir(ORIGINALS_DIR, { recursive: true });
  await fs.mkdir(THUMBS_DIR, { recursive: true });
}

export async function generateReceiptThumbnail(originalPath: string): Promise<string | null> {
  try {
    const base = path.basename(originalPath, path.extname(originalPath));
    const thumbPath = path.join(THUMBS_DIR, `${base}.webp`);
    await fs.mkdir(THUMBS_DIR, { recursive: true });
    await sharp(originalPath)
      .rotate()
      .resize({ width: THUMB_LONGEST_EDGE, height: THUMB_LONGEST_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toFile(thumbPath);
    return thumbPath;
  } catch (error) {
    console.warn("[expenses:thumb] generation failed, falling back to original", {
      originalPath,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Wave 3 → Wave 3.5: OCR preprocessing. The model degrades significantly
// when the image is tilted (item columns crop out) or low-resolution (text
// reads as noise). The pipeline below:
//
//   1. rotate() — applies EXIF orientation so the resize sees upright pixels
//   2. median(3) — removes salt-and-pepper noise from phone-camera JPEGs
//      (cheap, ~30ms on a 4MP photo). Skipped implicitly when the image is
//      already clean because it's a 3x3 kernel that doesn't accumulate.
//   3. resize(longest_edge=1400) — was 1600. Cutting 1600→1400 shrinks the
//      base64 payload by ~45% (network transfer + base64 encode dominate the
//      per-image wall time on a 2-image batch). Items still read clearly at
//      1400px because receipt text is large relative to the image.
//   4. normalize() — histogram stretch; lifts faded thermal-receipt text
//   5. linear(1.05, 0) — small extra contrast push on top of normalize,
//      helps when normalize() leaves a flat midtone
//   6. sharpen() — sigma=0.6 (lighter than default 1.0) so we don't halo
//      around thin receipt glyphs
//   7. JPEG q90 — visually lossless at this resolution; q85 dropped a column
//      in the Wave 3 smoke test, so we kept q90
//
// Returns the original buffer on any failure so the OCR call still has
// something to work with.
const OCR_LONGEST_EDGE = 1400;
// Wave 3.5 fix: tall merged screenshots (user stitches 3+ screenshots into
// one long image) become unreadable when fit-inside to 1400px — a 1280-wide
// screenshot collapses to ~328px wide. For those images we vertically tile
// the screenshot into overlapping chunks that keep the original width, so
// horizontal text stays legible. The OCR layer already treats multiple images
// as pages of the same order and merges duplicate lines (rule G).
const TALL_ASPECT_RATIO_THRESHOLD = 0.5;
const OCR_JPEG_QUALITY = 90;

async function splitTallReceiptImage(bytes: Buffer, width: number, height: number): Promise<Buffer[]> {
  const chunkHeight = OCR_LONGEST_EDGE;
  const overlap = 100;
  const chunks: Buffer[] = [];
  let y = 0;
  while (y < height) {
    const h = Math.min(chunkHeight, height - y);
    const chunk = await sharp(bytes)
      .extract({ left: 0, top: y, width, height: h })
      .jpeg({ quality: OCR_JPEG_QUALITY, mozjpeg: false })
      .toBuffer();
    chunks.push(chunk);
    if (h < chunkHeight) break;
    y += chunkHeight - overlap;
  }
  return chunks;
}

export async function prepareReceiptForOcr(
  bytes: Buffer,
  originalMimeType: string
): Promise<{ buffers: Buffer[]; mimeType: string }> {
  try {
    const metadata = await sharp(bytes).metadata();
    const width = metadata.width ?? 1;
    const height = metadata.height ?? 1;
    const aspectRatio = width / height;

    if (aspectRatio < TALL_ASPECT_RATIO_THRESHOLD) {
      const chunks = await splitTallReceiptImage(bytes, width, height);
      return { buffers: chunks, mimeType: "image/jpeg" };
    }

    const processed = await sharp(bytes)
      .rotate()
      .median(3)
      .resize({ width: OCR_LONGEST_EDGE, height: OCR_LONGEST_EDGE, fit: "inside", withoutEnlargement: true })
      .normalize()
      .linear(1.05, 0)
      .sharpen({ sigma: 0.6 })
      .jpeg({ quality: OCR_JPEG_QUALITY, mozjpeg: false })
      .toBuffer();
    return { buffers: [processed], mimeType: "image/jpeg" };
  } catch (error) {
    console.warn("[expenses:ocr-prep] preprocessing failed, falling back to original", {
      error: error instanceof Error ? error.message : String(error)
    });
    return { buffers: [bytes], mimeType: originalMimeType };
  }
}
