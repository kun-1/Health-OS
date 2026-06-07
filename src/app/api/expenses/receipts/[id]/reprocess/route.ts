import { NextRequest, NextResponse } from "next/server";

import { reprocessExpenseReceipt } from "@/lib/expenses/receipt-jobs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId) || receiptId <= 0) {
    return NextResponse.json({ error: "Invalid receipt id" }, { status: 400 });
  }

  try {
    return NextResponse.json(await reprocessExpenseReceipt(receiptId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reprocess failed" },
      { status: 400 }
    );
  }
}
