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
