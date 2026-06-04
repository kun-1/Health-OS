import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";

import { deleteExpenseTransaction, getExpenseReceipt, getExpenseTransaction, updateExpenseTransaction } from "@/lib/expenses/store";
import { extractedExpenseReceiptSchema } from "@/lib/expenses/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });
  }

  try {
    return NextResponse.json({ transaction: getExpenseTransaction(transactionId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transaction not found" }, { status: 404 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = extractedExpenseReceiptSchema.safeParse(body?.extracted ?? body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transaction", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json({ transaction: updateExpenseTransaction(transactionId, parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });
  }

  try {
    const transaction = getExpenseTransaction(transactionId);
    const receipt = transaction.receipt_id ? getExpenseReceipt(transaction.receipt_id) : null;
    const deleted = deleteExpenseTransaction(transactionId);
    if (receipt) {
      await fs.unlink(receipt.image_path).catch(() => undefined);
    }
    return NextResponse.json({ transaction: deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed" }, { status: 404 });
  }
}
