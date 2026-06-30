import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";

import { confirmReceipt, deleteExpenseReceipt, getExpenseReceipt } from "@/lib/expenses/store";
import { confirmExpenseReceiptSchema } from "@/lib/expenses/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function unlinkReceiptFiles(paths: Array<string | null | undefined>) {
  for (const filePath of Array.from(new Set(paths.filter((value): value is string => Boolean(value))))) {
    await fs.unlink(filePath).catch(() => undefined);
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId) || receiptId <= 0) {
    return NextResponse.json({ error: "Invalid receipt id" }, { status: 400 });
  }
  try {
    return NextResponse.json({ receipt: getExpenseReceipt(receiptId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Receipt not found" }, { status: 404 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId) || receiptId <= 0) {
    return NextResponse.json({ error: "Invalid receipt id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = confirmExpenseReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid receipt",
        details: parsed.error.flatten(),
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join(".")
        }))
      },
      { status: 400 }
    );
  }

  try {
    const receipt = confirmReceipt(receiptId, {
      ...parsed.data.extracted,
      user_note: parsed.data.user_note ?? parsed.data.extracted.user_note
    });
    return NextResponse.json({ receipt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Confirm failed" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId) || receiptId <= 0) {
    return NextResponse.json({ error: "Invalid receipt id" }, { status: 400 });
  }

  try {
    const receipt = deleteExpenseReceipt(receiptId);
    await unlinkReceiptFiles([
      receipt.image_path,
      receipt.thumbnail_path,
      ...receipt.images.map((image) => image.image_path)
    ]);
    return NextResponse.json({ receipt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed" }, { status: 404 });
  }
}
