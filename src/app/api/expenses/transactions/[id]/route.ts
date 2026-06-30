import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";

import { z } from "zod";

import {
  deleteExpenseTransaction,
  getExpenseReceipt,
  getExpenseTransaction,
  setExpenseTransactionExclusion,
  updateExpenseTransaction
} from "@/lib/expenses/store";
import { extractedExpenseReceiptSchema } from "@/lib/expenses/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function unlinkReceiptFiles(paths: Array<string | null | undefined>) {
  for (const filePath of Array.from(new Set(paths.filter((value): value is string => Boolean(value))))) {
    await fs.unlink(filePath).catch(() => undefined);
  }
}

// Wave 1 (Feature #3): allow a "just toggle the budget exclusion" PATCH
// without sending the full receipt payload.
// Wave 1 review fix (H4): .strict() rejects unknown keys with a 400 instead
// of silently dropping them. Previously a client sending { excludedFromBudget:
// true, merchant_name: "..." } would succeed and the typo would be hidden.
const exclusionToggleSchema = z
  .object({
    excludedFromBudget: z.boolean()
  })
  .strict();

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
  if (body && typeof body === "object" && "excludedFromBudget" in body && !("extracted" in body)) {
    const parsed = exclusionToggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid toggle", details: parsed.error.flatten() }, { status: 400 });
    }
    try {
      return NextResponse.json({
        transaction: setExpenseTransactionExclusion(transactionId, parsed.data.excludedFromBudget)
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Toggle failed" }, { status: 400 });
    }
  }

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
      await unlinkReceiptFiles([
        receipt.image_path,
        receipt.thumbnail_path,
        ...receipt.images.map((image) => image.image_path)
      ]);
    }
    return NextResponse.json({ transaction: deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed" }, { status: 404 });
  }
}
