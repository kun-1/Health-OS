import { NextRequest, NextResponse } from "next/server";

import {
  attachExpenseTransactionUiFields,
  createTransactionFromExtracted,
  listExpenseTransactions
} from "@/lib/expenses/store";
import { manualExpenseSchema } from "@/lib/expenses/validation";

export const runtime = "nodejs";

// Wave 2 feature: full list — GET /api/expenses/transactions?offset&limit
// drives the /expenses/all page. Caps limit at 200 to avoid unbounded
// response sizes. `month` (YYYY-MM) narrows to a single month like the
// analytics endpoint, but offset/limit still paginate within that month.
export async function GET(request: NextRequest) {
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? 0) || 0);
  const requested = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Math.min(200, Math.max(1, Number.isFinite(requested) ? requested : 50));
  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  const { rows, total } = listExpenseTransactions(limit, offset, month);
  const transactions = attachExpenseTransactionUiFields(rows);
  return NextResponse.json({ rows: transactions, transactions, total, offset, limit });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = manualExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid manual expense", details: parsed.error.flatten() }, { status: 400 });
  }

  const expense = parsed.data;
  const transaction = createTransactionFromExtracted(
    null,
    {
      merchant_name: expense.merchant_name,
      purchased_at: expense.purchased_at,
      currency: expense.currency,
      subtotal_amount: expense.amount,
      total_amount: expense.amount,
      tax_amount: 0,
      processing_fee: 0,
      delivery_fee: 0,
      delivery_discount: 0,
      discount_amount: 0,
      confidence: 1,
      model_suggested_auto_post: true,
      needs_review_reasons: [],
      recognition_note: "手动录入，非票据 OCR",
      user_note: expense.notes,
      items: [
        {
          name_raw: expense.item_name,
          name_zh: expense.item_name,
          category_zh: expense.category_zh,
          quantity: expense.quantity,
          spec_text: null,
          food_amount_value: null,
          food_amount_unit: null,
          unit_price: expense.amount,
          discounted_unit_price: null,
          amount: expense.amount,
          confidence: 1,
          notes: expense.notes
        }
      ]
    },
    // Wave 1 (Feature #3): honour the "不计入预算" checkbox.
    { excludedFromBudget: expense.excludedFromBudget }
  );

  return NextResponse.json({ transaction }, { status: 201 });
}
