import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Wave 1 (Feature #6): stream a receipt image from data/expense-receipts/.
// We refuse anything that escapes the directory (path traversal guard).
// Wave 2 feature: image compression — filenames may now be nested (e.g.
// "originals/1234-uuid.jpg"); the regex allows a single level of subdir, and
// the resolve check still rejects "../" escapes.
const RECEIPTS_DIR = path.join(process.cwd(), "data", "expense-receipts");

function safeResolve(filename: string): string | null {
  if (!/^(?:[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(filename)) return null;
  const resolved = path.resolve(RECEIPTS_DIR, filename);
  if (!resolved.startsWith(RECEIPTS_DIR + path.sep) && resolved !== RECEIPTS_DIR) return null;
  return resolved;
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ filename: string[] }> }) {
  const { filename } = await params;
  const resolved = safeResolve(filename.join("/"));
  if (!resolved) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  try {
    const bytes = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": mimeType,
        "cache-control": "private, max-age=300"
      }
    });
  } catch {
    return NextResponse.json({ error: "Receipt image not found" }, { status: 404 });
  }
}
