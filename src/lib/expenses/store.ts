import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import {
  expenseItems,
  expenseReceiptJobs,
  expenseReceipts,
  expenseTransactions,
  receiptHashes,
  recurringExpenses,
  type ExpenseItemRow,
  type ExpenseReceiptJobRow,
  type ExpenseReceiptRow,
  type ExpenseTransactionRow,
  type RecurringExpenseRow
} from "@/db/schema";
import { db, rawDb } from "@/lib/db";
import { fromCents, formatMoney, toCents } from "@/lib/expenses/money";
import { evaluateReceiptForPosting } from "@/lib/expenses/rules";
import { extractedExpenseReceiptSchema, getBlockingFields } from "@/lib/expenses/validation";
import type {
  ExpenseAnalytics,
  ExpenseDuplicateHint,
  ExpenseItem,
  ExpenseReceiptJob,
  ExpenseReceiptJobStatus,
  ExpenseReceiptStatus,
  ExpenseReceiptSummary,
  ExpenseTransaction,
  ExtractedExpenseReceipt,
  RecurringExpense,
  RecurringFrequency
} from "@/lib/expenses/types";

export const MONTHLY_EXPENSE_BUDGET = 2000;
// Wave 1 fix: cap retry attempts. After MAX_JOB_ATTEMPTS failures the job is
// marked 'dead' (semantic, not in DB enum) and removed from the due list.
export const MAX_JOB_ATTEMPTS = 5;
// Wave 1 review fix (H1): a job stuck in 'processing' for more than this is
// assumed to have been killed mid-run (OOM, kill -9, missed rejection). The
// next call to listDueExpenseReceiptJobs will roll it back to 'queued' so the
// retry path picks it up without bumping attempts.
export const STALE_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

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

function quantityCount(value: string | null): number | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const explicit = trimmed.match(/^[xX×]\s*(\d+(?:\.\d+)?)/);
  const fallback = trimmed.match(/^(\d+(?:\.\d+)?)/);
  const parsed = Number(explicit?.[1] ?? fallback?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function deriveFoodAmount(
  item: Pick<ExtractedExpenseReceipt["items"][number], "category_zh" | "quantity" | "spec_text" | "food_amount_value" | "food_amount_unit">
): { food_amount_value: number | null; food_amount_unit: string | null } {
  if (!["食物", "饮料/咖啡", "外食"].includes(item.category_zh)) {
    return { food_amount_value: item.food_amount_value, food_amount_unit: item.food_amount_unit };
  }

  const spec = cleanSpecText(item.spec_text);
  const count = quantityCount(item.quantity);
  if (spec) {
    const massOrVolume = spec.match(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g|克|ml|mL|毫升|l|L|升)/);
    if (massOrVolume) {
      const rawValue = Number(massOrVolume[1]);
      const rawUnit = massOrVolume[2];
      const multiplier = Number(spec.match(/[xX*×]\s*(\d+(?:\.\d+)?)/)?.[1] ?? count ?? 1);
      const unitMap: Record<string, { unit: string; factor: number }> = {
        kg: { unit: "g", factor: 1000 },
        千克: { unit: "g", factor: 1000 },
        公斤: { unit: "g", factor: 1000 },
        g: { unit: "g", factor: 1 },
        克: { unit: "g", factor: 1 },
        ml: { unit: "ml", factor: 1 },
        mL: { unit: "ml", factor: 1 },
        毫升: { unit: "ml", factor: 1 },
        l: { unit: "ml", factor: 1000 },
        L: { unit: "ml", factor: 1000 },
        升: { unit: "ml", factor: 1000 }
      };
      const mapped = unitMap[rawUnit];
      if (mapped && Number.isFinite(rawValue)) {
        return {
          food_amount_value: Number((rawValue * mapped.factor * multiplier).toFixed(2)),
          food_amount_unit: mapped.unit
        };
      }
    }
    if (item.food_amount_value !== null && item.food_amount_unit) {
      return { food_amount_value: item.food_amount_value, food_amount_unit: item.food_amount_unit };
    }
    const countLike = spec.match(/(\d+(?:\.\d+)?)\s*(瓶|个|盒|袋|份|块|只|听|包|罐)/);
    if (countLike) {
      return { food_amount_value: Number(countLike[1]), food_amount_unit: countLike[2] };
    }
  }

  if (item.food_amount_value !== null && item.food_amount_unit) {
    return { food_amount_value: item.food_amount_value, food_amount_unit: item.food_amount_unit };
  }
  return count ? { food_amount_value: count, food_amount_unit: "份" } : { food_amount_value: null, food_amount_unit: null };
}

function withDerivedFoodAmounts(extracted: ExtractedExpenseReceipt): ExtractedExpenseReceipt {
  return {
    ...extracted,
    items: extracted.items.map((item) => ({ ...item, ...deriveFoodAmount(item) }))
  };
}

function withComputedItemAmounts(extracted: ExtractedExpenseReceipt): ExtractedExpenseReceipt {
  return {
    ...extracted,
    items: extracted.items.map((item) => {
      const count = quantityCount(item.quantity);
      const unitPrice = item.discounted_unit_price ?? item.unit_price;
      if (item.amount !== null || !count || unitPrice === null) return item;
      return { ...item, amount: Number((unitPrice * count).toFixed(2)) };
    })
  };
}

function defaultPurchasedAtForToday(): string {
  // Wave 3 polish (Low): Intl.DateTimeFormat produces the local date parts in
  // one call. We then build a fixed-noon ISO string with the local offset.
  const now = new Date();
  const { year, month, day } = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now).reduce(
    (acc, part) => {
      if (part.type === "year" || part.type === "month" || part.type === "day") {
        acc[part.type] = part.value;
      }
      return acc;
    },
    { year: "0000", month: "01", day: "01" } as Record<string, string>
  );
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetMins = String(absoluteOffset % 60).padStart(2, "0");
  return `${year}-${month}-${day}T12:00:00${sign}${offsetHours}:${offsetMins}`;
}

function withDefaultReceiptFields(extracted: ExtractedExpenseReceipt): ExtractedExpenseReceipt {
  const normalized = withComputedItemAmounts(withDerivedFoodAmounts(extracted));
  let recognitionNote = extracted.recognition_note;
  let merchantName = normalized.merchant_name;
  let purchasedAt = normalized.purchased_at;

  if (!merchantName?.trim()) {
    merchantName = "未知商家";
    recognitionNote = appendRecognitionNote(recognitionNote, "商家名称缺失，已按未知商家补入");
  }

  if (!purchasedAt) {
    purchasedAt = defaultPurchasedAtForToday();
    recognitionNote = appendRecognitionNote(recognitionNote, "购买日期缺失，已按当前日期补入，可在确认前修改");
  }

  // Wave 1 fix: do NOT filter needs_review_reasons here. The single source of
  // truth is evaluation.reviewReasons which is written to review_reasons_json
  // (and normalized_json) by the caller. Mutating the input list causes drift
  // between in-memory and stored values.
  return {
    ...normalized,
    merchant_name: merchantName,
    purchased_at: purchasedAt,
    recognition_note: recognitionNote
  };
}

type DuplicateCandidate = {
  kind: "receipt" | "transaction";
  id: number;
  merchant: string | null;
  purchasedAt: string | null;
  totalAmount: number | null;
  currency: string;
  itemNames: string[];
};

function normalizeDuplicateText(value: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/未知商家|盒马鲜生店|盒马鲜生/g, "盒马")
    .trim();
}

function itemNameSet(names: string[]): Set<string> {
  return new Set(names.map(normalizeDuplicateText).filter((name) => name.length >= 2));
}

function overlapRatio(a: string[], b: string[]): number {
  const left = itemNameSet(a);
  const right = itemNameSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const name of left) {
    if (right.has(name)) shared += 1;
  }
  return shared / Math.min(left.size, right.size);
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.abs(left - right) / 86_400_000;
}

function duplicateHintFor(a: DuplicateCandidate, b: DuplicateCandidate): ExpenseDuplicateHint | null {
  if (a.id === b.id && a.kind === b.kind) return null;
  if (a.currency !== b.currency || a.totalAmount === null || b.totalAmount === null) return null;

  const amountDiff = Math.abs(a.totalAmount - b.totalAmount);
  const dayDiff = daysBetween(a.purchasedAt, b.purchasedAt);
  if (amountDiff > 0.01 || dayDiff === null || dayDiff > 3) return null;

  const merchantA = normalizeDuplicateText(a.merchant);
  const merchantB = normalizeDuplicateText(b.merchant);
  const merchantMatch = Boolean(merchantA && merchantB && (merchantA.includes(merchantB) || merchantB.includes(merchantA)));
  const itemOverlap = overlapRatio(a.itemNames, b.itemNames);
  const exactSameDay = dayDiff < 1;
  const sameTimeWindow = dayDiff < 1 / 48;
  const similarItemCount = Math.abs(a.itemNames.length - b.itemNames.length) <= 2;
  const enoughItems = Math.max(a.itemNames.length, b.itemNames.length) >= 2;

  const sameMomentDuplicate = sameTimeWindow && similarItemCount && enoughItems;
  if (!sameMomentDuplicate && !merchantMatch && itemOverlap < 0.45) return null;
  if (!sameMomentDuplicate && itemOverlap < 0.3 && !(merchantMatch && exactSameDay)) return null;

  const parts = [`金额相同 ${formatMoney(a.totalAmount, a.currency)}`];
  if (exactSameDay) parts.push("日期相同");
  else parts.push(`日期相差 ${Math.round(dayDiff)} 天`);
  if (sameTimeWindow) parts.push("时间高度接近");
  if (sameMomentDuplicate) parts.push("商品数量接近");
  if (merchantMatch) parts.push("商家相近");
  if (itemOverlap > 0) parts.push(`商品重合 ${Math.round(itemOverlap * 100)}%`);

  return {
    level: "high",
    matched_kind: b.kind,
    matched_id: b.id,
    reason: parts.join(" · ")
  };
}

function receiptDuplicateCandidate(receipt: ExpenseReceiptSummary): DuplicateCandidate {
  return {
    kind: "receipt",
    id: receipt.id,
    merchant: receipt.extracted.merchant_name,
    purchasedAt: receipt.extracted.purchased_at,
    totalAmount: receipt.extracted.total_amount,
    currency: receipt.extracted.currency,
    itemNames: receipt.extracted.items.map((item) => item.name_zh)
  };
}

function transactionDuplicateCandidate(transaction: ExpenseTransaction): DuplicateCandidate {
  return {
    kind: "transaction",
    id: transaction.id,
    merchant: transaction.merchant_name,
    purchasedAt: transaction.purchased_at,
    totalAmount: transaction.total_amount,
    currency: transaction.currency,
    itemNames: transaction.items.map((item) => item.name_zh)
  };
}

function annotateDuplicateHints<
  TReceipt extends ExpenseReceiptSummary,
  TTransaction extends ExpenseTransaction
>(receipts: TReceipt[], transactions: TTransaction[]) {
  const receiptCandidates = receipts.map(receiptDuplicateCandidate);
  const transactionCandidates = transactions.map(transactionDuplicateCandidate);
  const allCandidates = [...receiptCandidates, ...transactionCandidates];

  const receiptHints = new Map<number, ExpenseDuplicateHint>();
  const transactionHints = new Map<number, ExpenseDuplicateHint>();

  for (const candidate of allCandidates) {
    for (const other of allCandidates) {
      const hint = duplicateHintFor(candidate, other);
      if (!hint) continue;
      if (candidate.kind === "receipt") {
        receiptHints.set(candidate.id, hint);
      } else {
        transactionHints.set(candidate.id, hint);
      }
      break;
    }
  }

  return {
    receipts: receipts.map((receipt) => ({ ...receipt, duplicate_hint: receiptHints.get(receipt.id) ?? null })),
    transactions: transactions.map((transaction) => ({
      ...transaction,
      duplicate_hint: transactionHints.get(transaction.id) ?? null
    }))
  };
}

function receiptFromRow(row: ExpenseReceiptRow): ExpenseReceiptSummary {
  const extracted = withDerivedFoodAmounts(extractedExpenseReceiptSchema.parse(JSON.parse(row.normalizedJson)));
  return {
    id: row.id,
    status: row.status as ExpenseReceiptStatus,
    image_path: row.imagePath,
    image_mime_type: row.imageMimeType,
    // Wave 2 feature: image compression
    thumbnail_path: row.thumbnailPath,
    confidence: confidenceFromInt(row.confidence),
    review_reasons: JSON.parse(row.reviewReasonsJson) as string[],
    extracted,
    transaction_id: row.transactionId,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function jobFromRow(row: ExpenseReceiptJobRow): ExpenseReceiptJob {
  return {
    id: row.id,
    image_path: row.imagePath,
    image_mime_type: row.imageMimeType,
    original_filename: row.originalFilename,
    status: row.status as ExpenseReceiptJobStatus,
    error_message: row.errorMessage,
    attempts: row.attempts,
    next_attempt_at: row.nextAttemptAt,
    last_attempt_at: row.lastAttemptAt,
    receipt_id: row.receiptId,
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
    food_amount_value: row.foodAmountValue,
    food_amount_unit: row.foodAmountUnit,
    unit_price: row.unitPriceCents === null ? null : fromCents(row.unitPriceCents),
    discounted_unit_price:
      row.discountedUnitPriceCents === null ? null : fromCents(row.discountedUnitPriceCents),
    amount: row.amountCents === null ? null : fromCents(row.amountCents),
    confidence: confidenceFromInt(row.confidence),
    notes: row.notes
  };
}

// Wave 1 fix: batch-load items for many transactions in a single query to
// avoid N+1. Returns a Map keyed by transaction_id.
// Wave 3 polish (H3): migrated to drizzle for consistency with the rest of
// this module's read paths. Drizzle's inArray expands to the same IN clause.
function loadItemsForTransactions(transactionIds: number[]): Map<number, ExpenseItem[]> {
  const map = new Map<number, ExpenseItem[]>();
  if (transactionIds.length === 0) return map;
  const rows = db
    .select()
    .from(expenseItems)
    .where(inArray(expenseItems.transactionId, transactionIds))
    .orderBy(asc(expenseItems.transactionId), asc(expenseItems.id))
    .all();
  for (const row of rows) {
    const list = map.get(row.transactionId) ?? [];
    list.push(itemFromRow(row));
    map.set(row.transactionId, list);
  }
  return map;
}

function transactionFromRow(row: ExpenseTransactionRow, items: ExpenseItem[] = []): ExpenseTransaction {
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
    items,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

export function createTransactionFromExtracted(
  receiptId: number | null,
  extracted: ExtractedExpenseReceipt,
  options: { excludedFromBudget?: boolean } = {}
): ExpenseTransaction {
  // Wave 3 polish (M4): use the shared blocker list so the error message
  // matches what the UI shows. The early-return only narrows the types —
  // getBlockingFields is purely defensive.
  const blockers = getBlockingFields(extracted);
  if (blockers.length > 0) {
    throw new Error(`Cannot create transaction from incomplete receipt: ${blockers.join("、")}`);
  }
  // Wave 3 polish: getBlockingFields is not a type predicate, so we still
  // need the explicit type-guard below to narrow merchant_name /
  // purchased_at / total_amount for the inferred insert type.
  if (!extracted.merchant_name || !extracted.purchased_at || extracted.total_amount === null) {
    throw new Error("Cannot create transaction from incomplete receipt");
  }

  const now = new Date().toISOString();
  // Wave 1 review fix (C2): wrap INSERT transaction + INSERT items in a
  // single SQLite transaction. A crash between the two would otherwise leave
  // a transaction row with zero items, silently breaking the monthly category
  // chart. better-sqlite3 transactions are synchronous; we return the id
  // captured from the tx.run() result.
  // The early-return above narrows merchant_name / purchased_at to non-null;
  // hoist them into local consts so the inferred insert type matches.
  const merchantName = extracted.merchant_name;
  const purchasedAt = extracted.purchased_at;
  const transactionId = db.transaction((tx) => {
    const result = tx
      .insert(expenseTransactions)
      .values({
        receiptId,
        merchantName,
        purchasedAt,
        subtotalAmountCents: extracted.subtotal_amount === null ? null : toCents(extracted.subtotal_amount),
        totalAmountCents: toCents(extracted.total_amount),
        currency: extracted.currency,
        taxAmountCents: toCents(extracted.tax_amount),
        processingFeeCents: toCents(extracted.processing_fee),
        deliveryFeeCents: toCents(extracted.delivery_fee),
        deliveryDiscountCents: toCents(extracted.delivery_discount),
        discountAmountCents: toCents(extracted.discount_amount),
        notes: extracted.user_note,
        excludedFromBudget: options.excludedFromBudget ? 1 : 0,
        createdAt: now,
        updatedAt: now
      })
      .run();

    const newTransactionId = Number(result.lastInsertRowid);
    for (const item of extracted.items) {
      tx.insert(expenseItems)
        .values({
          transactionId: newTransactionId,
          nameRaw: item.name_raw,
          nameZh: item.name_zh,
          categoryZh: item.category_zh,
          quantity: item.quantity,
          specText: cleanSpecText(item.spec_text),
          foodAmountValue: item.food_amount_value,
          foodAmountUnit: item.food_amount_unit,
          unitPriceCents: item.unit_price === null ? null : toCents(item.unit_price),
          discountedUnitPriceCents:
            item.discounted_unit_price === null ? null : toCents(item.discounted_unit_price),
          amountCents: item.amount === null ? null : toCents(item.amount),
          confidence: confidenceToInt(item.confidence),
          notes: item.notes,
          createdAt: now,
          updatedAt: now
        })
        .run();
    }
    return newTransactionId;
  });

  return getExpenseTransaction(transactionId);
}

export function createReceipt(input: {
  imagePath: string;
  imageMimeType: string;
  rawModelJson: unknown;
  extracted: ExtractedExpenseReceipt;
  // Wave 2 feature: image compression
  thumbnailPath?: string | null;
  // Wave 3 dedup: SHA-256 hex of the raw upload bytes. Recorded into
  // receipt_hashes right after the receipt row commits so future uploads
  // can short-circuit with a 409. Hash is secondary; failures are logged
  // and never block the receipt itself.
  contentHash?: string | null;
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
      thumbnailPath: input.thumbnailPath ?? null,
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
  // Wave 3 dedup: record the hash outside the receipt insert. PRIMARY KEY
  // collision means a previous upload already owns this hash — log and move
  // on rather than failing the receipt (hash table is secondary).
  if (input.contentHash) {
    try {
      recordReceiptHash(receiptId, input.contentHash);
    } catch (error) {
      console.warn("[expenses:dedup] recordReceiptHash failed", {
        receiptId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return getExpenseReceipt(receiptId);
}

export function replaceExpenseReceiptExtraction(
  id: number,
  input: {
    rawModelJson: unknown;
    extracted: ExtractedExpenseReceipt;
    thumbnailPath?: string | null;
  }
): ExpenseReceiptSummary {
  const existing = getExpenseReceipt(id);
  if (existing.transaction_id || existing.status !== "pending_review") {
    throw new Error("Only pending review receipts can be reprocessed");
  }
  const now = new Date().toISOString();
  const extracted = withDefaultReceiptFields(input.extracted);
  const evaluation = evaluateReceiptForPosting(extracted);
  db.update(expenseReceipts)
    .set({
      status: evaluation.canAutoPost ? "auto_posted" : "pending_review",
      rawModelJson: JSON.stringify(input.rawModelJson),
      normalizedJson: JSON.stringify({ ...extracted, needs_review_reasons: evaluation.reviewReasons }),
      confidence: confidenceToInt(extracted.confidence),
      reviewReasonsJson: JSON.stringify(evaluation.reviewReasons),
      thumbnailPath: input.thumbnailPath ?? existing.thumbnail_path ?? null,
      updatedAt: now
    })
    .where(eq(expenseReceipts.id, id))
    .run();

  return getExpenseReceipt(id);
}

export function createReceiptJob(input: {
  imagePath: string;
  imageMimeType: string;
  originalFilename: string;
}): ExpenseReceiptJob {
  const now = new Date().toISOString();
  const result = db
    .insert(expenseReceiptJobs)
    .values({
      imagePath: input.imagePath,
      imageMimeType: input.imageMimeType,
      originalFilename: input.originalFilename,
      status: "queued",
      errorMessage: null,
      attempts: 0,
      nextAttemptAt: now,
      lastAttemptAt: null,
      receiptId: null,
      createdAt: now,
      updatedAt: now
    })
    .run();
  return getExpenseReceiptJob(Number(result.lastInsertRowid));
}

export function getExpenseReceiptJob(id: number): ExpenseReceiptJob {
  const row = db.select().from(expenseReceiptJobs).where(eq(expenseReceiptJobs.id, id)).get();
  if (!row) throw new Error(`Expense receipt job ${id} not found`);
  return jobFromRow(row);
}

export function listExpenseReceiptJobs(limit = 20): ExpenseReceiptJob[] {
  return db
    .select()
    .from(expenseReceiptJobs)
    .orderBy(desc(expenseReceiptJobs.createdAt))
    .limit(limit)
    .all()
    .map(jobFromRow);
}

export function listDueExpenseReceiptJobs(limit = 2): ExpenseReceiptJob[] {
  const now = new Date().toISOString();
  // Wave 1 review fix (H1): roll back 'processing' jobs that have been stuck
  // for longer than STALE_PROCESSING_TIMEOUT_MS. A worker that was killed
  // mid-OCR (or whose try/catch missed a rejection) leaves the job in
  // 'processing' forever otherwise, and manual retry would +1 attempts even
  // though the job never actually retried. Kept on rawDb because the rollback
  // runs before the SELECT and we want both inside a single implicit
  // auto-commit; drizzle's UPDATE here would also work but adds a layer of
  // re-mapping for no readability gain.
  // Wave 3 polish (H3): the SELECT below has been migrated to drizzle.
  const staleThreshold = new Date(Date.now() - STALE_PROCESSING_TIMEOUT_MS).toISOString();
  rawDb
    .prepare(
      `
        UPDATE expense_receipt_jobs
        SET status = 'queued', last_attempt_at = NULL
        WHERE status = 'processing' AND last_attempt_at < ?
      `
    )
    .run(staleThreshold);
  // Wave 1 fix: explicitly exclude 'dead' jobs (already filtered by the status
  // IN clause, but called out for clarity since the status is just TEXT).
  const rows = db
    .select()
    .from(expenseReceiptJobs)
    .where(
      and(
        inArray(expenseReceiptJobs.status, ["queued", "failed"]),
        ne(expenseReceiptJobs.status, "dead"),
        or(isNull(expenseReceiptJobs.nextAttemptAt), lte(expenseReceiptJobs.nextAttemptAt, now))
      )
    )
    .orderBy(asc(expenseReceiptJobs.createdAt))
    .limit(limit)
    .all();
  return rows.map(jobFromRow);
}

export function markReceiptJobProcessing(id: number): ExpenseReceiptJob {
  const now = new Date().toISOString();
  // Wave 3 polish (H3): migrated to drizzle. The attempts increment uses
  // sql`` because Drizzle's typed set() doesn't allow column references on
  // the right-hand side of an assignment.
  db.update(expenseReceiptJobs)
    .set({
      status: "processing",
      attempts: sql`${expenseReceiptJobs.attempts} + 1`,
      lastAttemptAt: now,
      updatedAt: now
    })
    .where(eq(expenseReceiptJobs.id, id))
    .run();
  return getExpenseReceiptJob(id);
}

export function markReceiptJobCompleted(id: number, receiptId: number): ExpenseReceiptJob {
  const now = new Date().toISOString();
  db.update(expenseReceiptJobs)
    .set({
      status: "completed",
      errorMessage: null,
      nextAttemptAt: null,
      receiptId,
      updatedAt: now
    })
    .where(eq(expenseReceiptJobs.id, id))
    .run();
  return getExpenseReceiptJob(id);
}

export function markReceiptJobFailed(id: number, errorMessage: string): ExpenseReceiptJob {
  const job = getExpenseReceiptJob(id);
  const now = new Date().toISOString();
  // Wave 1 fix: stop retrying once we hit MAX_JOB_ATTEMPTS. Mark as 'dead'
  // and clear next_attempt_at so listDueExpenseReceiptJobs won't pick it up.
  if (job.attempts >= MAX_JOB_ATTEMPTS) {
    db.update(expenseReceiptJobs)
      .set({
        status: "dead",
        errorMessage: errorMessage.slice(0, 1200),
        nextAttemptAt: null,
        updatedAt: now
      })
      .where(eq(expenseReceiptJobs.id, id))
      .run();
    return getExpenseReceiptJob(id);
  }
  const retryMinutes = Math.min(30, Math.max(2, 2 ** Math.min(job.attempts, 4)));
  const nextAttemptAt = new Date(Date.now() + retryMinutes * 60_000).toISOString();
  db.update(expenseReceiptJobs)
    .set({
      status: "failed",
      errorMessage: errorMessage.slice(0, 1200),
      nextAttemptAt,
      updatedAt: now
    })
    .where(eq(expenseReceiptJobs.id, id))
    .run();
  return getExpenseReceiptJob(id);
}

export function deleteExpenseReceiptJob(id: number): ExpenseReceiptJob {
  const job = getExpenseReceiptJob(id);
  db.delete(expenseReceiptJobs).where(eq(expenseReceiptJobs.id, id)).run();
  return job;
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

export function updateExpenseTransaction(
  id: number,
  extracted: ExtractedExpenseReceipt,
  options: { excludedFromBudget?: boolean } = {}
): ExpenseTransaction {
  const existing = getExpenseTransaction(id);
  const normalizedExtracted = withDefaultReceiptFields(extracted);
  // Wave 3 polish (M4): shared blocker list with the create path.
  const blockers = getBlockingFields(normalizedExtracted);
  if (blockers.length > 0) {
    throw new Error(`Cannot update transaction from incomplete receipt: ${blockers.join("、")}`);
  }
  // Wave 3 polish: getBlockingFields is not a type predicate, so this
  // explicit guard narrows the insert type below.
  if (!normalizedExtracted.merchant_name || !normalizedExtracted.purchased_at || normalizedExtracted.total_amount === null) {
    throw new Error("Cannot update transaction from incomplete receipt");
  }

  const now = new Date().toISOString();
  // Wave 1 fix: wrap UPDATE + DELETE items + INSERT items + receipt update in
  // a single SQLite transaction. better-sqlite3 transactions are synchronous,
  // and Drizzle exposes them via db.transaction((tx) => ...).
  const excludedFromBudget = options.excludedFromBudget ?? Boolean(existing.excluded_from_budget);
  // Wave 1 fix: narrow once, outside the closure, so the transaction callback
  // can rely on the non-null types.
  // Wave 3 polish (Low): comment clarified to call out the invariant — the
  // blocker check above guarantees these are non-null, so the `?? ""` is
  // only there to keep the inferred types honest.
  const merchantName = normalizedExtracted.merchant_name ?? "";
  const purchasedAt = normalizedExtracted.purchased_at ?? "";
  db.transaction((tx) => {
    tx.update(expenseTransactions)
      .set({
        merchantName,
        purchasedAt,
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
        excludedFromBudget: excludedFromBudget ? 1 : 0,
        updatedAt: now
      })
      .where(eq(expenseTransactions.id, id))
      .run();

    tx.delete(expenseItems).where(eq(expenseItems.transactionId, id)).run();

    for (const item of normalizedExtracted.items) {
      tx.insert(expenseItems)
        .values({
          transactionId: id,
          nameRaw: item.name_raw,
          nameZh: item.name_zh,
          categoryZh: item.category_zh,
          quantity: item.quantity,
          specText: cleanSpecText(item.spec_text),
          foodAmountValue: item.food_amount_value,
          foodAmountUnit: item.food_amount_unit,
          unitPriceCents: item.unit_price === null ? null : toCents(item.unit_price),
          discountedUnitPriceCents:
            item.discounted_unit_price === null ? null : toCents(item.discounted_unit_price),
          amountCents: item.amount === null ? null : toCents(item.amount),
          confidence: confidenceToInt(item.confidence),
          notes: item.notes,
          createdAt: now,
          updatedAt: now
        })
        .run();
    }

    if (existing.receipt_id) {
      tx.update(expenseReceipts)
        .set({
          normalizedJson: JSON.stringify({ ...normalizedExtracted, needs_review_reasons: [] }),
          confidence: confidenceToInt(normalizedExtracted.confidence),
          updatedAt: now
        })
        .where(eq(expenseReceipts.id, existing.receipt_id))
        .run();
    }
  });

  return getExpenseTransaction(id);
}

export function deleteExpenseTransaction(id: number): ExpenseTransaction {
  const transaction = getExpenseTransaction(id);
  // Wave 1 review fix (C3): wrap the cascade + receipt_job detach in a single
  // transaction. Also NULL expense_receipt_jobs.receipt_id for any job still
  // pointing at this receipt (Wave 1 fixed the same thing in
  // deleteExpenseReceipt, but missed this sibling path).
  db.transaction((tx) => {
    if (transaction.receipt_id) {
      tx.update(expenseReceiptJobs)
        .set({ receiptId: null })
        .where(eq(expenseReceiptJobs.receiptId, transaction.receipt_id))
        .run();
    }
    tx.delete(expenseItems).where(eq(expenseItems.transactionId, id)).run();
    tx.delete(expenseTransactions).where(eq(expenseTransactions.id, id)).run();
    if (transaction.receipt_id) {
      tx.delete(expenseReceipts).where(eq(expenseReceipts.id, transaction.receipt_id)).run();
    }
  });

  return transaction;
}

export function deleteExpenseReceipt(id: number): ExpenseReceiptSummary {
  const receipt = getExpenseReceipt(id);
  // Wave 3 dedup: the whole cascade (items → tx → job-detach → hash →
  // receipt) is now wrapped in a single SQLite transaction so a crash
  // mid-delete can never leave a hash pointing at a missing receipt.
  // The receipt itself is the source of truth; the hash row is secondary.
  db.transaction((tx) => {
    if (receipt.transaction_id) {
      // Wave 3 polish (H3): migrated to drizzle. The item delete has no
      // equivalent shortcut in the typed builder; items go first so the
      // transaction row doesn't briefly reference orphaned items.
      tx.delete(expenseItems).where(eq(expenseItems.transactionId, receipt.transaction_id!)).run();
      tx.delete(expenseTransactions).where(eq(expenseTransactions.id, receipt.transaction_id!)).run();
    }
    // Wave 1 fix: detach any receipt_jobs still pointing at this receipt so we
    // don't leave dangling references. Set receipt_id = NULL (keep the job row
    // so the user can see it failed; they can delete it from the queue UI).
    tx.update(expenseReceiptJobs)
      .set({ receiptId: null, updatedAt: new Date().toISOString() })
      .where(eq(expenseReceiptJobs.receiptId, id))
      .run();
    // Wave 3 dedup: hash row goes before the receipt row so a concurrent
    // re-upload of the same image can't observe a hash whose receipt
    // vanished mid-transaction.
    tx.delete(receiptHashes).where(eq(receiptHashes.receiptId, id)).run();
    tx.delete(expenseReceipts).where(eq(expenseReceipts.id, id)).run();
  });
  return receipt;
}

export function getExpenseReceipt(id: number): ExpenseReceiptSummary {
  const row = db.select().from(expenseReceipts).where(eq(expenseReceipts.id, id)).get();
  if (!row) throw new Error(`Expense receipt ${id} not found`);
  return receiptFromRow(row);
}

// Wave 3 dedup: O(1) lookup by hash. Returns the existing receipt summary
// (or null) so the upload route can surface the existing receipt id in its
// 409 response. The hash table is secondary — a missing row here just means
// "not a duplicate", not "data loss".
export function getReceiptByHash(hash: string): ExpenseReceiptSummary | null {
  const row = db
    .select({ receiptId: receiptHashes.receiptId })
    .from(receiptHashes)
    .where(eq(receiptHashes.hash, hash))
    .get();
  if (!row) return null;
  try {
    return getExpenseReceipt(row.receiptId);
  } catch {
    // Hash points at a receipt that was deleted without clearing the hash
    // (e.g. the cleanup tick hasn't run yet). Treat as non-duplicate.
    return null;
  }
}

// Wave 3 dedup: persist the (hash → receipt) mapping. PRIMARY KEY is the
// hash itself; a second receipt with the same hash would throw on insert
// and the caller's try/catch (in createReceipt) logs a warning and proceeds.
export function recordReceiptHash(receiptId: number, hash: string): void {
  db.insert(receiptHashes)
    .values({ hash, receiptId, createdAt: new Date().toISOString() })
    .run();
}

// Wave 1 (Feature #3): quick toggle for the "不计入预算" chip on the
// transaction card. PATCH endpoint just flips the boolean.
export function setExpenseTransactionExclusion(id: number, excluded: boolean): ExpenseTransaction {
  const now = new Date().toISOString();
  db.update(expenseTransactions)
    .set({ excludedFromBudget: excluded ? 1 : 0, updatedAt: now })
    .where(eq(expenseTransactions.id, id))
    .run();
  return getExpenseTransaction(id);
}

export function listExpenseReceipts(limit = 20): ExpenseReceiptSummary[] {
  return db.select().from(expenseReceipts).orderBy(desc(expenseReceipts.createdAt)).limit(limit).all().map(receiptFromRow);
}

export function getExpenseTransaction(id: number): ExpenseTransaction {
  const row = db.select().from(expenseTransactions).where(eq(expenseTransactions.id, id)).get();
  if (!row) throw new Error(`Expense transaction ${id} not found`);
  const items = loadItemsForTransactions([id]).get(id) ?? [];
  return transactionFromRow(row, items);
}

// Wave 2 feature: full list — default limit raised from 30 to 100 so the
// monthly "已入账" view shows a real history, and a dedicated /expenses/all
// page can paginate beyond that. `offset` is the simple offset/limit paging
// used by the full-list page; the analytics view still uses limit-only.
// `month` (YYYY-MM) and `tz` (IANA) narrow the result to a single month so
// the /expenses/all page can use the same month filter as the KPI strip.
export function listExpenseTransactions(
  limit = 100,
  offset = 0,
  month?: string,
  tz: string = DEFAULT_EXPENSE_TZ
): { rows: ExpenseTransaction[]; total: number } {
  let totalRow: { count: number };
  let rows: ExpenseTransactionRow[];
  if (month) {
    const { start, end } = monthRange(month, tz);
    // Wave 3 polish (H3): COUNT via drizzle so this module is consistent. We
    // reuse the same gte/lt predicates the rows query uses below.
    const monthRows = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(expenseTransactions)
      .where(and(gte(expenseTransactions.purchasedAt, start), lt(expenseTransactions.purchasedAt, end)))
      .all();
    totalRow = { count: Number(monthRows[0]?.count ?? 0) };
    rows = db
      .select()
      .from(expenseTransactions)
      .where(and(gte(expenseTransactions.purchasedAt, start), lt(expenseTransactions.purchasedAt, end)))
      .orderBy(desc(expenseTransactions.purchasedAt), desc(expenseTransactions.id))
      .limit(limit)
      .offset(offset)
      .all();
  } else {
    // Wave 3 polish (H3): no-month branch also moved to drizzle.
    const allRows = db.select({ count: sql<number>`COUNT(*)` }).from(expenseTransactions).all();
    totalRow = { count: Number(allRows[0]?.count ?? 0) };
    rows = db
      .select()
      .from(expenseTransactions)
      .orderBy(desc(expenseTransactions.purchasedAt), desc(expenseTransactions.id))
      .limit(limit)
      .offset(offset)
      .all();
  }
  // Wave 1 fix: one query for all items instead of N+1.
  const itemsByTx = loadItemsForTransactions(rows.map((r) => r.id));
  return {
    rows: rows.map((row) => transactionFromRow(row, itemsByTx.get(row.id) ?? [])),
    total: totalRow.count
  };
}

// Back-compat shim: callers that ignore pagination (the analytics view) still
// expect a plain array. Centralised here so the two return shapes stay in sync.
export function listExpenseTransactionsFlat(limit = 100): ExpenseTransaction[] {
  return listExpenseTransactions(limit).rows;
}

export function attachExpenseTransactionUiFields<T extends ExpenseTransaction>(
  transactions: T[]
): (T & {
  formatted_total: string;
  formatted_subtotal: string | null;
  receipt_image_path: string | null;
  receipt_thumbnail_path: string | null;
})[] {
  return transactions.map((tx) => {
    let receiptImagePath: string | null = null;
    let receiptThumbnailPath: string | null = null;
    if (tx.receipt_id) {
      const row = db
        .select({ imagePath: expenseReceipts.imagePath, thumbnailPath: expenseReceipts.thumbnailPath })
        .from(expenseReceipts)
        .where(eq(expenseReceipts.id, tx.receipt_id))
        .get();
      receiptImagePath = row?.imagePath ?? null;
      receiptThumbnailPath = row?.thumbnailPath ?? null;
    }
    return {
      ...tx,
      formatted_total: formatMoney(tx.total_amount, tx.currency),
      formatted_subtotal: tx.subtotal_amount === null ? null : formatMoney(tx.subtotal_amount, tx.currency),
      receipt_image_path: receiptImagePath,
      receipt_thumbnail_path: receiptThumbnailPath
    };
  });
}

function tzOffsetSuffix(tz: string, year: number, month: number, day: number): string {
  // Wave 1 fix: derive the UTC offset for an IANA timezone on a given date.
  // Used to build month boundaries in the user's local timezone so the
  // purchased_at string comparison works without storing a separate UTC column.
  try {
    const utc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(utc);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!m) return "+00:00";
    const sign = m[1];
    const hours = m[2].padStart(2, "0");
    const minutes = (m[3] ?? "00").padStart(2, "0");
    return `${sign}${hours}:${minutes}`;
  } catch {
    // Wave 3 polish (M2): fallback to a fixed +08:00 offset. The previous
    // fallback (returning "GMT" → "+00:00") silently shifted Asia/Shanghai
    // data into UTC during SSR when Intl couldn't resolve the timezone.
    // Hardcoding the user's TZ is wrong in general, but the caller path that
    // hits this catch is SSR with an unrecognised tz, and Date.parse on the
    // resulting ISO string still tolerates the small offset drift.
    return "+08:00";
  }
}

// Wave 2 feature: export — exported so the /api/expenses/export route can
// reuse the same month-bucket semantics as the analytics endpoint.
export function monthRange(month: string, tz: string) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNumber = Number(monthStr);
  if (!year || !monthNumber) {
    throw new Error(`Invalid month: ${month}`);
  }
  const startOffset = tzOffsetSuffix(tz, year, monthNumber, 1);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01T00:00:00.000${startOffset}`;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const endOffset = tzOffsetSuffix(tz, nextYear, nextMonth, 1);
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000${endOffset}`;
  return { start, end };
}

export const DEFAULT_EXPENSE_TZ = "Asia/Shanghai";

export function getExpenseAnalytics(
  month = new Date().toISOString().slice(0, 7),
  tz: string = DEFAULT_EXPENSE_TZ,
  // Wave 2 feature: budget settings — caller-supplied overrides take
  // precedence over the hardcoded fallback below.
  overrides: { budgetCents?: number | null; primaryCurrency?: string | null } = {}
): ExpenseAnalytics {
  const { start, end } = monthRange(month, tz);
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

  // Wave 1 (Feature #3): also sum the excluded transactions so we can show
  // the user how much was carved out of the budget.
  const excludedRow = rawDb
    .prepare(
      `
        SELECT
          COALESCE(SUM(total_amount_cents), 0) AS total
        FROM expense_transactions
        WHERE purchased_at >= ?
          AND purchased_at < ?
          AND excluded_from_budget = 1
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

  // Wave 1 cleanup: group totals by currency so the page-level KPI / hero /
  // donut can show per-currency figures instead of silently mixing units.
  // Wave 2 feature: budget settings — primary currency is now caller-
  // overridable. Fallback is the hardcoded constant for back-compat.
  const primaryCurrency =
    typeof overrides.primaryCurrency === "string" && overrides.primaryCurrency.length > 0
      ? overrides.primaryCurrency
      : "CNY";
  const budgetCurrency = primaryCurrency;
  const budgetCents =
    typeof overrides.budgetCents === "number" && overrides.budgetCents > 0
      ? overrides.budgetCents
      : MONTHLY_EXPENSE_BUDGET * 100;

  const totalByCurrencyRows = rawDb
    .prepare(
      `
        SELECT currency, COALESCE(SUM(total_amount_cents), 0) AS total
        FROM expense_transactions
        WHERE purchased_at >= ?
          AND purchased_at < ?
          AND excluded_from_budget = 0
        GROUP BY currency
      `
    )
    .all(start, end) as { currency: string; total: number }[];

  const excludedByCurrencyRows = rawDb
    .prepare(
      `
        SELECT currency, COALESCE(SUM(total_amount_cents), 0) AS total
        FROM expense_transactions
        WHERE purchased_at >= ?
          AND purchased_at < ?
          AND excluded_from_budget = 1
        GROUP BY currency
      `
    )
    .all(start, end) as { currency: string; total: number }[];

  const totalByCurrency: Record<string, number> = {};
  for (const row of totalByCurrencyRows) {
    totalByCurrency[row.currency] = row.total;
  }
  const excludedByCurrency: Record<string, number> = {};
  for (const row of excludedByCurrencyRows) {
    excludedByCurrency[row.currency] = row.total;
  }

  const primarySpentCents = totalByCurrency[budgetCurrency] ?? 0;
  const budgetRemainingCents = budgetCents - primarySpentCents;

  // Wave 1 cleanup: category breakdown scoped to the primary currency so the
  // donut percentages sum to 100% of what counts against the budget.
  const categoryBreakdownRows = rawDb
    .prepare(
      `
        SELECT i.category_zh AS category_zh, COALESCE(SUM(i.amount_cents), 0) AS amount
        FROM expense_items i
        JOIN expense_transactions t ON t.id = i.transaction_id
        WHERE t.purchased_at >= ?
          AND t.purchased_at < ?
          AND t.excluded_from_budget = 0
          AND t.currency = ?
        GROUP BY i.category_zh
        ORDER BY amount DESC
      `
    )
    .all(start, end, budgetCurrency) as { category_zh: ExpenseAnalytics["category_totals"][number]["category_zh"]; amount: number }[];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const totalDays = Math.ceil((nextMonthStart.getTime() - monthStart.getTime()) / 86400000);
  const todayOfMonth = now.getDate();
  const elapsedDays = Math.max(1, todayOfMonth);
  const remainingDays = Math.max(1, totalDays - todayOfMonth);
  const spent = fromCents(totals.total);
  const excluded = fromCents(excludedRow.total);
  // Wave 1 fix (Bug #14): the effective spend is what hits the budget; this
  // stays the same in single-currency usage and is documented for multi-currency.
  const effectiveSpent = spent;
  // Wave 2 feature: budget settings — monthly_budget / remaining / projected
  // are now derived from the (possibly caller-overridden) budgetCents.
  const monthlyBudgetYuan = fromCents(budgetCents);
  const remaining = Number((monthlyBudgetYuan - effectiveSpent).toFixed(2));
  const projected = Number(((effectiveSpent / elapsedDays) * totalDays).toFixed(2));

  // Wave 1 (Feature #3): build a friendly "已剔除 X 不计预算" label when there
  // are excluded transactions this month.
  // Wave 2 feature: budget settings — label uses the user-selected currency.
  const budgetProgressLabel =
    excluded > 0 ? `已剔除 ${formatMoney(excluded, primaryCurrency)} 不计预算` : null;

  // Wave 1 fix (Bug #14): pre-format every transaction's total in its own
  // currency so cards don't have to call Intl on the client and so the page
  // no longer derives a single global "currency" from the most recent tx.
  // Wave 1 (Feature #6): also surface the linked receipt's image path so the
  // transaction card can show a thumbnail in edit mode.
  const recentTransactions = attachExpenseTransactionUiFields(listExpenseTransactionsFlat(100));
  const pendingReceipts = listExpenseReceipts(20).filter((receipt) => receipt.status === "pending_review");
  const duplicateAnnotated = annotateDuplicateHints(pendingReceipts, recentTransactions);

  return {
    month,
    timezone: tz,
    monthly_budget: monthlyBudgetYuan,
    spent_this_month: spent,
    excluded_this_month: excluded,
    effective_spent_this_month: effectiveSpent,
    budget_progress_label: budgetProgressLabel,
    remaining_this_month: remaining,
    remaining_daily_budget: Number((remaining / remainingDays).toFixed(2)),
    projected_month_end_spend: projected,
    over_budget_now: remaining < 0,
    projected_over_budget: projected > monthlyBudgetYuan,
    category_totals: categoryRows.map((row) => ({
      category_zh: row.category_zh,
      amount: fromCents(row.amount),
      formatted_amount: formatMoney(fromCents(row.amount), primaryCurrency)
    })),
    recent_transactions: duplicateAnnotated.transactions,
    pending_receipts: duplicateAnnotated.receipts,
    receipt_jobs: listExpenseReceiptJobs(20).filter((job) => job.status !== "completed"),
    total_by_currency: totalByCurrency,
    excluded_this_month_by_currency: excludedByCurrency,
    primary_currency: primaryCurrency,
    budget_currency: budgetCurrency,
    budget_progress: {
      spent: primarySpentCents,
      budget: budgetCents,
      remaining: budgetRemainingCents,
      over_budget: budgetRemainingCents < 0
    },
    category_breakdown: categoryBreakdownRows.map((row) => ({
      category_zh: row.category_zh,
      amount: row.amount,
      currency: budgetCurrency
    }))
  };
}

// ----------------------------------------------------------------------
// Wave 3 subscription: recurring rules
// ----------------------------------------------------------------------

type RecurringFrequencyLiteral = RecurringFrequency;

function parseStartDateAsLocalNoon(isoDate: string): Date {
  // Wave 3 subscription: helper — start_date is YYYY-MM-DD with no time, so
  // we anchor to local noon. Anchoring to noon avoids any DST / timezone
  // boundary skipping the rule forward a day during the spring/fall shifts.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Invalid start_date: ${isoDate}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function parseEndDateAsLocalNoon(isoDate: string): Date {
  return parseStartDateAsLocalNoon(isoDate);
}

function ruleFromRow(row: RecurringExpenseRow): RecurringExpense {
  return {
    id: row.id,
    merchant_name: row.merchantName,
    amount_cents: row.amountCents,
    currency: row.currency,
    category_zh: row.categoryZh,
    frequency: row.frequency as RecurringFrequencyLiteral,
    day_of_month: row.dayOfMonth,
    day_of_week: row.dayOfWeek,
    month_of_year: row.monthOfYear,
    active: row.active,
    start_date: row.startDate,
    end_date: row.endDate,
    last_run_at: row.lastRunAt,
    next_run_at: row.nextRunAt,
    notes: row.notes,
    excluded_from_budget: row.excludedFromBudget,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

export type RecurringExpenseInput = {
  merchantName: string;
  amountCents: number;
  currency: string;
  categoryZh: string;
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  excludedFromBudget: boolean;
};

function validateDayFieldConsistency(input: {
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
}): void {
  if (input.frequency === "monthly" && input.dayOfMonth === null) {
    throw new Error("monthly 规则必须设置 dayOfMonth");
  }
  if (input.frequency === "weekly" && input.dayOfWeek === null) {
    throw new Error("weekly 规则必须设置 dayOfWeek");
  }
  if (input.frequency === "yearly" && (input.monthOfYear === null || input.dayOfMonth === null)) {
    throw new Error("yearly 规则必须设置 monthOfYear + dayOfMonth");
  }
}

// Wave 3 subscription: compute the next run time for a rule. PURE function
// — same inputs always produce the same Date. Used for:
//   - initial nextRunAt at create time (anchor: startDate at local noon)
//   - advancing nextRunAt after a tick fires (anchor: the tick's `now`)
// Semantics are STRICT: returns the first occurrence strictly after `from`.
// For weekly: if from.getDay() === dayOfWeek, we skip 7 days (otherwise we'd
// re-fire at the same instant, which is a foot-gun for the scheduler).
// Time-of-day is preserved from `from` so a rule that just ran at 14:23:45
// tomorrow runs at 14:23:45.
export function computeNextRun(
  rule: { frequency: string; dayOfMonth: number | null; dayOfWeek: number | null; monthOfYear: number | null },
  from: Date
): Date {
  const hour = from.getHours();
  const minute = from.getMinutes();
  const second = from.getSeconds();
  const ms = from.getMilliseconds();
  const fromMs = from.getTime();
  const build = (year: number, monthIdx: number, day: number) =>
    new Date(year, monthIdx, day, hour, minute, second, ms);

  if (rule.frequency === "daily") {
    // First occurrence strictly after `from`: +1 day at the same wall time.
    // setDate handles month rollover (Jan 31 + 1 day = Feb 1) for free.
    const next = new Date(from);
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (rule.frequency === "weekly") {
    const dow = rule.dayOfWeek ?? 0;
    const current = from.getDay();
    // Days until the next target weekday; mod 7 keeps it in [0, 6].
    // If the rule's day matches today we want NEXT week's instance, not
    // today — otherwise the scheduler would re-fire at the same instant.
    let diff = (dow - current + 7) % 7;
    if (diff === 0) diff = 7;
    const next = new Date(from);
    next.setDate(next.getDate() + diff);
    return next;
  }

  if (rule.frequency === "monthly") {
    // Wave 3 subscription: STRICT-after semantics — returning a candidate
    // whose instant equals from would re-fire the rule on the next tick.
    const dom = rule.dayOfMonth ?? 1;
    // Candidate: this month, dayOfMonth at the same wall time.
    // STRICT-after: if the candidate's instant equals from (same wall
    // time on the same day — the rule's "this month's slot" is the
    // very moment we're computing from), we MUST roll forward. The
    // scheduler's tick loops every hour; returning the same instant
    // would re-fire immediately and create an infinite run loop. Schema
    // enforces 1-28 so there's no day-overflow edge case (e.g. Jan 31
    // -> Feb 31 would normalise to Mar 3, which is not what we want).
    const candidate = build(from.getFullYear(), from.getMonth(), dom);
    if (candidate.getTime() <= fromMs) {
      return build(from.getFullYear(), from.getMonth() + 1, dom);
    }
    return candidate;
  }

  if (rule.frequency === "yearly") {
    // Wave 3 subscription: same STRICT-after fix as the monthly branch.
    const moy = rule.monthOfYear ?? 1;
    const dom = rule.dayOfMonth ?? 1;
    // Same STRICT-after semantics as the monthly branch above. Without
    // the <=, a rule that just fired on Jan 1 at exactly now would
    // re-fire on the very next tick.
    const candidate = build(from.getFullYear(), moy - 1, dom);
    if (candidate.getTime() <= fromMs) {
      return build(from.getFullYear() + 1, moy - 1, dom);
    }
    return candidate;
  }

  // Unknown frequency — fall back to "1 day from now" rather than throw.
  // A bad value would have been rejected by the Zod schema already.
  return new Date(fromMs + 24 * 60 * 60 * 1000);
}

function initialNextRunAtForCreate(input: RecurringExpenseInput): string {
  validateDayFieldConsistency(input);
  const startDate = parseStartDateAsLocalNoon(input.startDate);
  const next = computeNextRun(
    { frequency: input.frequency, dayOfMonth: input.dayOfMonth, dayOfWeek: input.dayOfWeek, monthOfYear: input.monthOfYear },
    startDate
  );
  return next.toISOString();
}

function nextRunAtForUpdate(input: RecurringExpenseInput): string {
  // Recompute from startDate so a frequency change resets the schedule to
  // the original intent rather than continuing from the old next_run_at
  // (which might be stale by weeks if the user just changed dayOfMonth).
  const startDate = parseStartDateAsLocalNoon(input.startDate);
  return computeNextRun(
    { frequency: input.frequency, dayOfMonth: input.dayOfMonth, dayOfWeek: input.dayOfWeek, monthOfYear: input.monthOfYear },
    startDate
  ).toISOString();
}

export function createRecurringExpense(input: RecurringExpenseInput): RecurringExpense {
  validateDayFieldConsistency(input);
  if (input.endDate && input.endDate < input.startDate) {
    throw new Error("endDate 不能早于 startDate");
  }
  const now = new Date().toISOString();
  const nextRunAt = initialNextRunAtForCreate(input);
  const result = db
    .insert(recurringExpenses)
    .values({
      merchantName: input.merchantName,
      amountCents: input.amountCents,
      currency: input.currency,
      categoryZh: input.categoryZh,
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth,
      dayOfWeek: input.dayOfWeek,
      monthOfYear: input.monthOfYear,
      active: true,
      startDate: input.startDate,
      endDate: input.endDate,
      lastRunAt: null,
      nextRunAt,
      notes: input.notes,
      excludedFromBudget: input.excludedFromBudget,
      createdAt: now,
      updatedAt: now
    })
    .run();
  return getRecurringExpense(Number(result.lastInsertRowid));
}

export function getRecurringExpense(id: number): RecurringExpense {
  const row = db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id)).get();
  if (!row) throw new Error(`Recurring expense ${id} not found`);
  return ruleFromRow(row);
}

export function listRecurringExpenses(filter?: { active?: boolean }): RecurringExpense[] {
  let query = db.select().from(recurringExpenses).orderBy(asc(recurringExpenses.id));
  if (filter?.active !== undefined) {
    query = query.where(eq(recurringExpenses.active, filter.active)) as typeof query;
  }
  return query.all().map(ruleFromRow);
}

export function updateRecurringExpense(
  id: number,
  patch: Partial<RecurringExpenseInput> & { active?: boolean }
): RecurringExpense {
  const existing = getRecurringExpense(id);
  const merged: RecurringExpenseInput = {
    merchantName: patch.merchantName ?? existing.merchant_name,
    amountCents: patch.amountCents ?? existing.amount_cents,
    currency: patch.currency ?? existing.currency,
    categoryZh: patch.categoryZh ?? existing.category_zh,
    frequency: (patch.frequency ?? existing.frequency) as RecurringFrequency,
    dayOfMonth: patch.dayOfMonth !== undefined ? patch.dayOfMonth : existing.day_of_month,
    dayOfWeek: patch.dayOfWeek !== undefined ? patch.dayOfWeek : existing.day_of_week,
    monthOfYear: patch.monthOfYear !== undefined ? patch.monthOfYear : existing.month_of_year,
    startDate: patch.startDate ?? existing.start_date,
    endDate: patch.endDate !== undefined ? patch.endDate : existing.end_date,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    excludedFromBudget:
      patch.excludedFromBudget !== undefined ? patch.excludedFromBudget : existing.excluded_from_budget
  };
  validateDayFieldConsistency(merged);
  if (merged.endDate && merged.endDate < merged.startDate) {
    throw new Error("endDate 不能早于 startDate");
  }
  // Frequency / day / month / startDate changes require recomputing
  // nextRunAt; otherwise we leave the existing schedule intact.
  const scheduleChanged =
    patch.frequency !== undefined ||
    patch.dayOfMonth !== undefined ||
    patch.dayOfWeek !== undefined ||
    patch.monthOfYear !== undefined ||
    patch.startDate !== undefined;
  const now = new Date().toISOString();
  const updates: Partial<typeof recurringExpenses.$inferInsert> = {
    merchantName: merged.merchantName,
    amountCents: merged.amountCents,
    currency: merged.currency,
    categoryZh: merged.categoryZh,
    frequency: merged.frequency,
    dayOfMonth: merged.dayOfMonth,
    dayOfWeek: merged.dayOfWeek,
    monthOfYear: merged.monthOfYear,
    startDate: merged.startDate,
    endDate: merged.endDate,
    notes: merged.notes,
    excludedFromBudget: merged.excludedFromBudget,
    updatedAt: now
  };
  if (scheduleChanged) {
    updates.nextRunAt = nextRunAtForUpdate(merged);
  }
  if (patch.active !== undefined) {
    updates.active = patch.active;
  }
  db.update(recurringExpenses).set(updates).where(eq(recurringExpenses.id, id)).run();
  return getRecurringExpense(id);
}

export function deleteRecurringExpense(id: number): RecurringExpense {
  const rule = getRecurringExpense(id);
  db.delete(recurringExpenses).where(eq(recurringExpenses.id, id)).run();
  return rule;
}

// Wave 3 subscription: scheduler feed. Active rules whose next_run_at has
// already passed. Partial index on (next_run_at) WHERE active=1 keeps this
// O(matches), not O(total).
export function getDueRecurringExpenses(now: Date): RecurringExpense[] {
  const cutoff = now.toISOString();
  const rows = db
    .select()
    .from(recurringExpenses)
    .where(and(eq(recurringExpenses.active, true), lte(recurringExpenses.nextRunAt, cutoff)))
    .orderBy(asc(recurringExpenses.nextRunAt))
    .all();
  return rows.map(ruleFromRow);
}

// Wave 3 subscription: post-tick bookkeeping. nextRunAt comes from the
// caller (computeNextRun) so the scheduler controls the timing semantics.
export function markRecurringExpenseRun(id: number, lastRunAt: string, nextRunAt: string): RecurringExpense {
  db.update(recurringExpenses)
    .set({ lastRunAt, nextRunAt, updatedAt: new Date().toISOString() })
    .where(eq(recurringExpenses.id, id))
    .run();
  return getRecurringExpense(id);
}

// Wave 3 subscription: called by the scheduler when the next run would
// overshoot endDate — flips active=0 so listDueRecurringExpenses stops
// returning it. Idempotent (re-deactivating is a no-op).
export function deactivateRecurringExpense(id: number): RecurringExpense {
  db.update(recurringExpenses)
    .set({ active: false, updatedAt: new Date().toISOString() })
    .where(eq(recurringExpenses.id, id))
    .run();
  return getRecurringExpense(id);
}

// Wave 3 subscription: re-anchor nextRunAt to "now". Used by the
// "立即跑一次" UI button so the user doesn't have to wait up to an hour
// for the next tick. The scheduler's own getDueRecurringExpenses will then
// pick it up on the next pass, OR the same API handler can call
// runRecurringTick() to fire it synchronously.
export function bumpRecurringExpenseNextRun(id: number, at: Date): RecurringExpense {
  db.update(recurringExpenses)
    .set({ nextRunAt: at.toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(recurringExpenses.id, id))
    .run();
  return getRecurringExpense(id);
}

export {
  parseEndDateAsLocalNoon,
  parseStartDateAsLocalNoon
};
