import { desc, eq } from "drizzle-orm";

import { expenseItems, expenseReceipts, expenseTransactions, type ExpenseItemRow, type ExpenseReceiptRow, type ExpenseTransactionRow } from "@/db/schema";
import { db, rawDb } from "@/lib/db";
import { fromCents, toCents } from "@/lib/expenses/money";
import { evaluateReceiptForPosting } from "@/lib/expenses/rules";
import type { ExpenseAnalytics, ExpenseItem, ExpenseReceiptStatus, ExpenseReceiptSummary, ExpenseTransaction, ExtractedExpenseReceipt } from "@/lib/expenses/types";

export const MONTHLY_EXPENSE_BUDGET = 2000;

function confidenceToInt(value: number): number {
  return Math.round(value * 1000);
}

function confidenceFromInt(value: number): number {
  return Number((value / 1000).toFixed(3));
}

function cleanSpecText(value: string | null): string | null {
  const cleaned = value?.replace(/约|大约|左右/g, "").trim();
  return cleaned ? cleaned : null;
}

function appendRecognitionNote(note: string | null, addition: string): string {
  return note ? `${note}；${addition}` : addition;
}

function defaultPurchasedAtForToday(): string {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetMins = String(absoluteOffset % 60).padStart(2, "0");
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T12:00:00${sign}${offsetHours}:${offsetMins}`;
}

function withDefaultReceiptFields(extracted: ExtractedExpenseReceipt): ExtractedExpenseReceipt {
  let recognitionNote = extracted.recognition_note;
  let merchantName = extracted.merchant_name;
  let purchasedAt = extracted.purchased_at;

  if (!merchantName?.trim()) {
    merchantName = "未知商家";
    recognitionNote = appendRecognitionNote(recognitionNote, "商家名称缺失，已按未知商家补入");
  }

  if (!purchasedAt) {
    purchasedAt = defaultPurchasedAtForToday();
    recognitionNote = appendRecognitionNote(recognitionNote, "购买日期缺失，已按当前日期补入，可在确认前修改");
  }

  return {
    ...extracted,
    merchant_name: merchantName,
    purchased_at: purchasedAt,
    recognition_note: recognitionNote,
    needs_review_reasons: extracted.needs_review_reasons.filter(
      (reason) => !["缺少商家名称", "缺少购买时间"].includes(reason)
    )
  };
}

function receiptFromRow(row: ExpenseReceiptRow): ExpenseReceiptSummary {
  return {
    id: row.id,
    status: row.status as ExpenseReceiptStatus,
    image_path: row.imagePath,
    confidence: confidenceFromInt(row.confidence),
    review_reasons: JSON.parse(row.reviewReasonsJson) as string[],
    extracted: JSON.parse(row.normalizedJson) as ExtractedExpenseReceipt,
    transaction_id: row.transactionId,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function itemFromRow(row: ExpenseItemRow): ExpenseItem {
  return {
    id: row.id,
    transaction_id: row.transactionId,
    name_raw: row.nameRaw,
    name_zh: row.nameZh,
    category_zh: row.categoryZh as ExpenseItem["category_zh"],
    quantity: row.quantity,
    spec_text: cleanSpecText(row.specText),
    unit_price: row.unitPriceCents === null ? null : fromCents(row.unitPriceCents),
    amount: row.amountCents === null ? null : fromCents(row.amountCents),
    confidence: confidenceFromInt(row.confidence),
    notes: row.notes
  };
}

function transactionFromRow(row: ExpenseTransactionRow): ExpenseTransaction {
  const rows = db.select().from(expenseItems).where(eq(expenseItems.transactionId, row.id)).all();
  return {
    id: row.id,
    receipt_id: row.receiptId,
    merchant_name: row.merchantName,
    purchased_at: row.purchasedAt,
    subtotal_amount: row.subtotalAmountCents === null ? null : fromCents(row.subtotalAmountCents),
    total_amount: fromCents(row.totalAmountCents),
    currency: row.currency,
    tax_amount: fromCents(row.taxAmountCents),
    processing_fee: fromCents(row.processingFeeCents),
    delivery_fee: fromCents(row.deliveryFeeCents),
    delivery_discount: fromCents(row.deliveryDiscountCents),
    discount_amount: fromCents(row.discountAmountCents),
    notes: row.notes,
    excluded_from_budget: Boolean(row.excludedFromBudget),
    items: rows.map(itemFromRow),
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

export function createTransactionFromExtracted(receiptId: number | null, extracted: ExtractedExpenseReceipt): ExpenseTransaction {
  if (!extracted.merchant_name || !extracted.purchased_at || extracted.total_amount === null) {
    throw new Error("Cannot create transaction from incomplete receipt");
  }

  const now = new Date().toISOString();
  const result = db
    .insert(expenseTransactions)
    .values({
      receiptId,
      merchantName: extracted.merchant_name,
      purchasedAt: extracted.purchased_at,
      subtotalAmountCents: extracted.subtotal_amount === null ? null : toCents(extracted.subtotal_amount),
      totalAmountCents: toCents(extracted.total_amount),
      currency: extracted.currency,
      taxAmountCents: toCents(extracted.tax_amount),
      processingFeeCents: toCents(extracted.processing_fee),
      deliveryFeeCents: toCents(extracted.delivery_fee),
      deliveryDiscountCents: toCents(extracted.delivery_discount),
      discountAmountCents: toCents(extracted.discount_amount),
      notes: extracted.user_note,
      excludedFromBudget: 0,
      createdAt: now,
      updatedAt: now
    })
    .run();

  const transactionId = Number(result.lastInsertRowid);
  for (const item of extracted.items) {
    db.insert(expenseItems)
      .values({
        transactionId,
        nameRaw: item.name_raw,
        nameZh: item.name_zh,
        categoryZh: item.category_zh,
        quantity: item.quantity,
        specText: cleanSpecText(item.spec_text),
        unitPriceCents: item.unit_price === null ? null : toCents(item.unit_price),
        amountCents: item.amount === null ? null : toCents(item.amount),
        confidence: confidenceToInt(item.confidence),
        notes: item.notes,
        createdAt: now,
        updatedAt: now
      })
      .run();
  }

  return getExpenseTransaction(transactionId);
}

export function createReceipt(input: {
  imagePath: string;
  imageMimeType: string;
  rawModelJson: unknown;
  extracted: ExtractedExpenseReceipt;
}): ExpenseReceiptSummary {
  const now = new Date().toISOString();
  const extracted = withDefaultReceiptFields(input.extracted);
  const evaluation = evaluateReceiptForPosting(extracted);
  const status: ExpenseReceiptStatus = evaluation.canAutoPost ? "auto_posted" : "pending_review";
  const result = db
    .insert(expenseReceipts)
    .values({
      imagePath: input.imagePath,
      imageMimeType: input.imageMimeType,
      status,
      rawModelJson: JSON.stringify(input.rawModelJson),
      normalizedJson: JSON.stringify({ ...extracted, needs_review_reasons: evaluation.reviewReasons }),
      confidence: confidenceToInt(extracted.confidence),
      reviewReasonsJson: JSON.stringify(evaluation.reviewReasons),
      transactionId: null,
      createdAt: now,
      updatedAt: now
    })
    .run();

  const receiptId = Number(result.lastInsertRowid);
  if (status === "auto_posted") {
    const transaction = createTransactionFromExtracted(receiptId, extracted);
    db.update(expenseReceipts)
      .set({ transactionId: transaction.id, updatedAt: new Date().toISOString() })
      .where(eq(expenseReceipts.id, receiptId))
      .run();
  }

  return getExpenseReceipt(receiptId);
}

export function confirmReceipt(id: number, extracted: ExtractedExpenseReceipt): ExpenseReceiptSummary {
  const existing = getExpenseReceipt(id);
  if (existing.transaction_id) {
    return existing;
  }
  const normalizedExtracted = withDefaultReceiptFields(extracted);
  const transaction = createTransactionFromExtracted(id, { ...normalizedExtracted, needs_review_reasons: [] });
  const now = new Date().toISOString();
  db.update(expenseReceipts)
    .set({
      status: "confirmed",
      normalizedJson: JSON.stringify({ ...normalizedExtracted, needs_review_reasons: [] }),
      confidence: confidenceToInt(normalizedExtracted.confidence),
      reviewReasonsJson: JSON.stringify([]),
      transactionId: transaction.id,
      updatedAt: now
    })
    .where(eq(expenseReceipts.id, id))
    .run();
  return getExpenseReceipt(id);
}

export function updateExpenseTransaction(id: number, extracted: ExtractedExpenseReceipt): ExpenseTransaction {
  const existing = getExpenseTransaction(id);
  const normalizedExtracted = withDefaultReceiptFields(extracted);
  if (!normalizedExtracted.merchant_name || !normalizedExtracted.purchased_at || normalizedExtracted.total_amount === null) {
    throw new Error("Cannot update transaction from incomplete receipt");
  }

  const now = new Date().toISOString();
  db.update(expenseTransactions)
    .set({
      merchantName: normalizedExtracted.merchant_name,
      purchasedAt: normalizedExtracted.purchased_at,
      subtotalAmountCents:
        normalizedExtracted.subtotal_amount === null ? null : toCents(normalizedExtracted.subtotal_amount),
      totalAmountCents: toCents(normalizedExtracted.total_amount),
      currency: normalizedExtracted.currency,
      taxAmountCents: toCents(normalizedExtracted.tax_amount),
      processingFeeCents: toCents(normalizedExtracted.processing_fee),
      deliveryFeeCents: toCents(normalizedExtracted.delivery_fee),
      deliveryDiscountCents: toCents(normalizedExtracted.delivery_discount),
      discountAmountCents: toCents(normalizedExtracted.discount_amount),
      notes: normalizedExtracted.user_note,
      updatedAt: now
    })
    .where(eq(expenseTransactions.id, id))
    .run();

  rawDb
    .prepare(
      `
        DELETE FROM expense_items
        WHERE transaction_id = ?
      `
    )
    .run(id);

  for (const item of normalizedExtracted.items) {
    db.insert(expenseItems)
      .values({
        transactionId: id,
        nameRaw: item.name_raw,
        nameZh: item.name_zh,
        categoryZh: item.category_zh,
        quantity: item.quantity,
        specText: cleanSpecText(item.spec_text),
        unitPriceCents: item.unit_price === null ? null : toCents(item.unit_price),
        amountCents: item.amount === null ? null : toCents(item.amount),
        confidence: confidenceToInt(item.confidence),
        notes: item.notes,
        createdAt: now,
        updatedAt: now
      })
      .run();
  }

  if (existing.receipt_id) {
    db.update(expenseReceipts)
      .set({
        normalizedJson: JSON.stringify({ ...normalizedExtracted, needs_review_reasons: [] }),
        confidence: confidenceToInt(normalizedExtracted.confidence),
        updatedAt: now
      })
      .where(eq(expenseReceipts.id, existing.receipt_id))
      .run();
  }

  return getExpenseTransaction(id);
}

export function deleteExpenseTransaction(id: number): ExpenseTransaction {
  const transaction = getExpenseTransaction(id);
  rawDb
    .prepare(
      `
        DELETE FROM expense_items
        WHERE transaction_id = ?
      `
    )
    .run(id);
  db.delete(expenseTransactions).where(eq(expenseTransactions.id, id)).run();

  if (transaction.receipt_id) {
    db.delete(expenseReceipts).where(eq(expenseReceipts.id, transaction.receipt_id)).run();
  }

  return transaction;
}

export function deleteExpenseReceipt(id: number): ExpenseReceiptSummary {
  const receipt = getExpenseReceipt(id);
  if (receipt.transaction_id) {
    rawDb
      .prepare(
        `
          DELETE FROM expense_items
          WHERE transaction_id = ?
        `
      )
      .run(receipt.transaction_id);
    rawDb
      .prepare(
        `
          DELETE FROM expense_transactions
          WHERE id = ?
        `
      )
      .run(receipt.transaction_id);
  }
  db.delete(expenseReceipts).where(eq(expenseReceipts.id, id)).run();
  return receipt;
}

export function getExpenseReceipt(id: number): ExpenseReceiptSummary {
  const row = db.select().from(expenseReceipts).where(eq(expenseReceipts.id, id)).get();
  if (!row) throw new Error(`Expense receipt ${id} not found`);
  return receiptFromRow(row);
}

export function listExpenseReceipts(limit = 20): ExpenseReceiptSummary[] {
  return db.select().from(expenseReceipts).orderBy(desc(expenseReceipts.createdAt)).limit(limit).all().map(receiptFromRow);
}

export function getExpenseTransaction(id: number): ExpenseTransaction {
  const row = db.select().from(expenseTransactions).where(eq(expenseTransactions.id, id)).get();
  if (!row) throw new Error(`Expense transaction ${id} not found`);
  return transactionFromRow(row);
}

export function listExpenseTransactions(limit = 30): ExpenseTransaction[] {
  return db.select().from(expenseTransactions).orderBy(desc(expenseTransactions.purchasedAt), desc(expenseTransactions.id)).limit(limit).all().map(transactionFromRow);
}

function monthRange(month: string) {
  const start = `${month}-01T00:00:00.000+08:00`;
  const [year, monthNumber] = month.split("-").map(Number);
  const endDate = new Date(Date.UTC(year, monthNumber, 1));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000+08:00`;
  return { start, end };
}

export function getExpenseAnalytics(month = new Date().toISOString().slice(0, 7)): ExpenseAnalytics {
  const { start, end } = monthRange(month);
  const totals = rawDb
    .prepare(
      `
        SELECT
          COALESCE(SUM(total_amount_cents), 0) AS total
        FROM expense_transactions
        WHERE purchased_at >= ?
          AND purchased_at < ?
          AND excluded_from_budget = 0
      `
    )
    .get(start, end) as { total: number };

  const categoryRows = rawDb
    .prepare(
      `
        SELECT i.category_zh AS category_zh, COALESCE(SUM(i.amount_cents), 0) AS amount
        FROM expense_items i
        JOIN expense_transactions t ON t.id = i.transaction_id
        WHERE t.purchased_at >= ?
          AND t.purchased_at < ?
          AND t.excluded_from_budget = 0
        GROUP BY i.category_zh
        ORDER BY amount DESC
      `
    )
    .all(start, end) as { category_zh: ExpenseAnalytics["category_totals"][number]["category_zh"]; amount: number }[];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const totalDays = Math.ceil((nextMonthStart.getTime() - monthStart.getTime()) / 86400000);
  const todayOfMonth = now.getDate();
  const elapsedDays = Math.max(1, todayOfMonth);
  const remainingDays = Math.max(1, totalDays - todayOfMonth);
  const spent = fromCents(totals.total);
  const remaining = Number((MONTHLY_EXPENSE_BUDGET - spent).toFixed(2));
  const projected = Number(((spent / elapsedDays) * totalDays).toFixed(2));

  return {
    month,
    monthly_budget: MONTHLY_EXPENSE_BUDGET,
    spent_this_month: spent,
    remaining_this_month: remaining,
    remaining_daily_budget: Number((remaining / remainingDays).toFixed(2)),
    projected_month_end_spend: projected,
    over_budget_now: remaining < 0,
    projected_over_budget: projected > MONTHLY_EXPENSE_BUDGET,
    category_totals: categoryRows.map((row) => ({ category_zh: row.category_zh, amount: fromCents(row.amount) })),
    recent_transactions: listExpenseTransactions(20),
    pending_receipts: listExpenseReceipts(20).filter((receipt) => receipt.status === "pending_review")
  };
}
