import { and, desc, gte, lt } from "drizzle-orm";

import { expenseTransactions } from "@/db/schema";
import { db, rawDb } from "@/lib/db";
import { DEFAULT_EXPENSE_TZ, monthRange } from "@/lib/expenses/store";
import type { ExpenseItem } from "@/lib/expenses/types";

// Wave 2 feature: export — GET /api/expenses/export?format=csv|json&month=YYYY-MM
// streams all transactions (plus items) in the requested format. No pagination:
// the user asked for a one-shot export, capped at the existing index limits.

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvEscape).join(",");
}

const CSV_HEADERS = [
  "transaction_id",
  "purchased_at",
  "merchant",
  "currency",
  "subtotal_cents",
  "total_cents",
  "tax_cents",
  "processing_fee_cents",
  "delivery_fee_cents",
  "delivery_discount_cents",
  "discount_cents",
  "excluded_from_budget",
  "items_json"
] as const;

type ExportRow = {
  transaction_id: number;
  purchased_at: string;
  merchant: string;
  currency: string;
  subtotal_cents: number | null;
  total_cents: number;
  tax_cents: number;
  processing_fee_cents: number;
  delivery_fee_cents: number;
  delivery_discount_cents: number;
  discount_cents: number;
  excluded_from_budget: 0 | 1;
  items_json: string;
};

type TransactionSummary = {
  id: number;
  receipt_id: number | null;
  merchant_name: string;
  purchased_at: string;
  currency: string;
  notes: string | null;
  excluded_from_budget: boolean;
};

function loadRows(month: string | null, tz: string): ExportRow[] {
  let transactions: TransactionSummary[];
  if (month) {
    const { start, end } = monthRange(month, tz);
    const rows = db
      .select()
      .from(expenseTransactions)
      .where(and(gte(expenseTransactions.purchasedAt, start), lt(expenseTransactions.purchasedAt, end)))
      .orderBy(desc(expenseTransactions.purchasedAt), desc(expenseTransactions.id))
      .all();
    transactions = rows.map((row) => ({
      id: row.id,
      receipt_id: row.receiptId,
      merchant_name: row.merchantName,
      purchased_at: row.purchasedAt,
      currency: row.currency,
      notes: row.notes,
      excluded_from_budget: Boolean(row.excludedFromBudget)
    }));
  } else {
    const rows = rawDb
      .prepare(
        `SELECT id, receipt_id AS receiptId, merchant_name AS merchantName,
                purchased_at AS purchasedAt, currency, notes,
                excluded_from_budget AS excludedFromBudget
         FROM expense_transactions
         ORDER BY purchased_at DESC, id DESC`
      )
      .all() as Array<{
      id: number;
      receiptId: number | null;
      merchantName: string;
      purchasedAt: string;
      currency: string;
      notes: string | null;
      excludedFromBudget: number;
    }>;
    transactions = rows.map((row) => ({
      id: row.id,
      receipt_id: row.receiptId,
      merchant_name: row.merchantName,
      purchased_at: row.purchasedAt,
      currency: row.currency,
      notes: row.notes,
      excluded_from_budget: Boolean(row.excludedFromBudget)
    }));
  }

  if (transactions.length === 0) return [];

  // Pull items + cents values for every transaction in two batched queries
  // (one round-trip per kind, no N+1).
  const ids = transactions.map((t) => t.id);
  const placeholders = ids.map(() => "?").join(",");
  const itemRows = rawDb
    .prepare(
      `SELECT id, transaction_id AS transactionId, name_raw AS nameRaw, name_zh AS nameZh,
              category_zh AS categoryZh, quantity, spec_text AS specText,
              food_amount_value AS foodAmountValue,
              food_amount_unit AS foodAmountUnit,
              unit_price_cents AS unitPriceCents,
              discounted_unit_price_cents AS discountedUnitPriceCents,
              amount_cents AS amountCents,
              confidence, notes
       FROM expense_items
       WHERE transaction_id IN (${placeholders})`
    )
    .all(...ids) as Array<{
    id: number;
    transactionId: number;
    nameRaw: string;
    nameZh: string;
    categoryZh: string;
    quantity: string | null;
    specText: string | null;
    foodAmountValue: number | null;
    foodAmountUnit: string | null;
    unitPriceCents: number | null;
    discountedUnitPriceCents: number | null;
    amountCents: number | null;
    confidence: number;
    notes: string | null;
  }>;

  const centsRows = rawDb
    .prepare(
      `SELECT id,
              subtotal_amount_cents AS subtotalAmountCents,
              total_amount_cents AS totalAmountCents,
              tax_amount_cents AS taxAmountCents,
              processing_fee_cents AS processingFeeCents,
              delivery_fee_cents AS deliveryFeeCents,
              delivery_discount_cents AS deliveryDiscountCents,
              discount_amount_cents AS discountAmountCents,
              excluded_from_budget AS excludedFromBudget
       FROM expense_transactions
       WHERE id IN (${placeholders})`
    )
    .all(...ids) as Array<{
    id: number;
    subtotalAmountCents: number | null;
    totalAmountCents: number;
    taxAmountCents: number;
    processingFeeCents: number;
    deliveryFeeCents: number;
    deliveryDiscountCents: number;
    discountAmountCents: number;
    excludedFromBudget: number;
  }>;

  const itemsByTx = new Map<number, ExpenseItem[]>();
  for (const row of itemRows) {
    const list = itemsByTx.get(row.transactionId) ?? [];
    list.push({
      id: row.id,
      transaction_id: row.transactionId,
      name_raw: row.nameRaw,
      name_zh: row.nameZh,
      category_zh: row.categoryZh as ExpenseItem["category_zh"],
      quantity: row.quantity,
      spec_text: row.specText,
      food_amount_value: row.foodAmountValue,
      food_amount_unit: row.foodAmountUnit,
      unit_price: row.unitPriceCents === null ? null : row.unitPriceCents / 100,
      discounted_unit_price:
        row.discountedUnitPriceCents === null ? null : row.discountedUnitPriceCents / 100,
      amount: row.amountCents === null ? null : row.amountCents / 100,
      confidence: row.confidence,
      notes: row.notes
    });
    itemsByTx.set(row.transactionId, list);
  }

  const centsById = new Map(centsRows.map((row) => [row.id, row]));

  return transactions.map((tx) => {
    const cents = centsById.get(tx.id);
    const items = itemsByTx.get(tx.id) ?? [];
    return {
      transaction_id: tx.id,
      purchased_at: tx.purchased_at,
      merchant: tx.merchant_name,
      currency: tx.currency,
      subtotal_cents: cents?.subtotalAmountCents ?? null,
      total_cents: cents?.totalAmountCents ?? 0,
      tax_cents: cents?.taxAmountCents ?? 0,
      processing_fee_cents: cents?.processingFeeCents ?? 0,
      delivery_fee_cents: cents?.deliveryFeeCents ?? 0,
      delivery_discount_cents: cents?.deliveryDiscountCents ?? 0,
      discount_cents: cents?.discountAmountCents ?? 0,
      excluded_from_budget: cents?.excludedFromBudget ? 1 : 0,
      items_json: JSON.stringify(items)
    };
  });
}

function safeMonth(input: string | null): string {
  if (!input) return "all";
  return /^\d{4}-\d{2}$/.test(input) ? input : "all";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const monthParam = url.searchParams.get("month");
  const tz = url.searchParams.get("tz") ?? DEFAULT_EXPENSE_TZ;
  const safeMonthLabel = safeMonth(monthParam);
  const filename = `expenses-${safeMonthLabel}.${format}`;

  if (format !== "csv" && format !== "json") {
    return new Response(JSON.stringify({ error: "format must be csv or json" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const rows = loadRows(monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null, tz);

  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`
      }
    });
  }

  // CSV: BOM header so Excel renders UTF-8 correctly.
  const lines = [csvRow([...CSV_HEADERS])];
  for (const row of rows) {
    lines.push(
      csvRow([
        row.transaction_id,
        row.purchased_at,
        row.merchant,
        row.currency,
        row.subtotal_cents,
        row.total_cents,
        row.tax_cents,
        row.processing_fee_cents,
        row.delivery_fee_cents,
        row.delivery_discount_cents,
        row.discount_cents,
        row.excluded_from_budget,
        row.items_json
      ])
    );
  }
  const body = "\uFEFF" + lines.join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}
