import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { extractReceiptWithOpenRouter } from "@/lib/expenses/ocr";
import { createReceipt, listExpenseReceipts } from "@/lib/expenses/store";

export const runtime = "nodejs";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxFilesPerRequest = 2;
const maxFileBytes = 8 * 1024 * 1024;

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: NextRequest) {
  const requestStartedAt = performance.now();
  const form = await request.formData().catch(() => null);
  const files = [...(form?.getAll("receipts") ?? []), ...(form?.getAll("receipt") ?? [])].filter(
    (file): file is File => file instanceof File
  );
  if (files.length === 0) {
    return NextResponse.json({ error: "receipt image is required" }, { status: 400 });
  }
  if (files.length > maxFilesPerRequest) {
    return NextResponse.json({ error: `一次最多上传 ${maxFilesPerRequest} 张票据，避免视觉模型请求排队过久` }, { status: 400 });
  }

  const receipts = [];
  const failures = [];
  const timings = [];

  const receiptsDir = path.join(process.cwd(), "data", "expense-receipts");
  await fs.mkdir(receiptsDir, { recursive: true });

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

    const filename = `${Date.now()}-${crypto.randomUUID()}.${extensionForMimeType(file.type)}`;
    const imagePath = path.join(receiptsDir, filename);
    const saveStartedAt = performance.now();
    await fs.writeFile(imagePath, bytes);
    const saveMs = elapsedSince(saveStartedAt);

    try {
      const encodeStartedAt = performance.now();
      const imageBase64 = bytes.toString("base64");
      const encodeMs = elapsedSince(encodeStartedAt);
      const ocrStartedAt = performance.now();
      const ocr = await extractReceiptWithOpenRouter({
        imageBase64,
        mimeType: file.type
      });
      const ocrMs = elapsedSince(ocrStartedAt);
      const dbStartedAt = performance.now();
      const receipt = createReceipt({
        imagePath,
        imageMimeType: file.type,
        rawModelJson: ocr.raw,
        extracted: ocr.extracted
      });
      const dbMs = elapsedSince(dbStartedAt);
      receipts.push(receipt);
      const timing = {
        filename: file.name,
        size_bytes: bytes.byteLength,
        provider: ocr.provider,
        model: ocr.model,
        total_ms: elapsedSince(fileStartedAt),
        read_ms: readMs,
        save_ms: saveMs,
        encode_ms: encodeMs,
        ocr_ms: ocrMs,
        db_ms: dbMs,
        provider_timings: ocr.timings
      };
      timings.push(timing);
      console.info("[expenses:receipt-ocr:timing]", timing);
    } catch (error) {
      const timing = {
        filename: file.name,
        size_bytes: bytes.byteLength,
        total_ms: elapsedSince(fileStartedAt),
        read_ms: readMs,
        save_ms: saveMs
      };
      timings.push(timing);
      console.error("[expenses:receipt-ocr]", {
        error: error instanceof Error ? error.message : error,
        imagePath,
        timing
      });
      failures.push({
        filename: file.name,
        error: error instanceof Error ? error.message : "Receipt OCR failed",
        image_path: imagePath,
        timing
      });
    }
  }

  if (receipts.length === 0) {
    return NextResponse.json(
      { error: "All receipt OCR attempts failed", failures, timings, total_ms: elapsedSince(requestStartedAt) },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { receipts, failures, timings, total_ms: elapsedSince(requestStartedAt) },
    { status: failures.length > 0 ? 207 : 201 }
  );
}

export async function GET() {
  return NextResponse.json({ receipts: listExpenseReceipts(30) });
}
