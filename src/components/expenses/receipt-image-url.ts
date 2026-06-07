"use client";

const RECEIPT_PATH_MARKER = "/data/expense-receipts/";

function encodeReceiptPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function receiptImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const normalized = imagePath.replaceAll("\\", "/");
  const markerIndex = normalized.indexOf(RECEIPT_PATH_MARKER);
  const relative =
    markerIndex >= 0
      ? normalized.slice(markerIndex + RECEIPT_PATH_MARKER.length)
      : normalized.split("/").filter(Boolean).at(-1);
  return relative ? `/expense-receipts/${encodeReceiptPath(relative)}` : null;
}
