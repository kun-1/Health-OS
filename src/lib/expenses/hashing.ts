import { createHash } from "node:crypto";

// Wave 3 dedup: SHA-256 hex of the raw upload bytes. We rely on Node's stdlib
// (no new dependency) and keep the API deliberately tiny: callers either have
// a Buffer already (worker, upload route) or want a File → Buffer shortcut.
export function sha256OfBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function sha256OfFile(file: File | Buffer): Promise<string> {
  const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;
  return sha256OfBuffer(buffer);
}
