import { z } from "zod";

import { expenseCategories } from "@/lib/expenses/types";
import type { ExpenseCategory, ExtractedExpenseReceipt } from "@/lib/expenses/types";

// Max string length for a "category" field — anything longer is almost
// certainly the model echoing the prompt back at us.
const CATEGORY_MAX_LENGTH = 40;

// Wave 1 fix (Bug #24): no-offset datetime strings from the OCR or the manual
// panel are interpreted as UTC, not as the server's local time. Previously
// they had the *server* offset appended, which silently shifted the instant
// when the server and the user were in different timezones. This is now
// documented behaviour for receiptDateTime below.

const money = z.coerce.number().finite().min(0).max(1_000_000);
const signedMoney = z.coerce.number().finite().min(-1_000_000).max(1_000_000);
const nullableMoney = money.nullable();
const nullableDiscountMoney = signedMoney
  .nullable()
  .transform((value) => (value === null ? null : Math.abs(value)));
const confidence = z.coerce.number().finite().min(0).max(1);
const optionalText = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .transform((value) => (value === "" ? null : value));
const optionalShortText = z
  .string()
  .trim()
  .max(24)
  .nullable()
  .transform((value) => (value === "" ? null : value));

// Wave 3 (Issue: schema strictness). The model often returns category variants
// that aren't in the canonical 12 ("外带", "咖啡", "日用", "交通费"...). Crashing
// the whole receipt on a near-miss is too aggressive — the user can fix it in
// the review UI.
//
// Strategy: the schema returns BOTH `category_zh` (the resolved value) AND
// `category_raw` (the model's original output, populated only when we
// coerced). The receipt-level transform then walks items and appends a
// needs_review_reason for any coerced value, so the user knows which fields
// need eyeballing.
//
// Returns the model's string verbatim when it's not canonical and not in the
// alias map. This is the "accept original value" path the user asked for —
// the review form will show the raw string and the user picks the right
// canonical one. Manual entry (manualExpenseSchema) keeps the strict enum
// because the UI dropdown only offers canonical values.
const CANONICAL_CATEGORIES = new Set<string>(expenseCategories);
const categoryAliasMap: Record<string, ExpenseCategory> = {
  // 外食
  外带: "外食",
  外卖: "外食",
  餐饮: "外食",
  餐厅: "外食",
  // 饮料/咖啡
  饮料: "饮料/咖啡",
  咖啡: "饮料/咖啡",
  饮品: "饮料/咖啡",
  茶水: "饮料/咖啡",
  // 日用品
  日用: "日用品",
  日用百货: "日用品",
  百货: "日用品",
  // 清洁用品
  清洁: "清洁用品",
  // 个人护理
  护理: "个人护理",
  // 药品/医疗
  医疗: "药品/医疗",
  医药: "药品/医疗",
  药品: "药品/医疗",
  看病: "药品/医疗",
  // 交通
  交通费: "交通",
  交通出行: "交通",
  出行: "交通",
  打车: "交通",
  // 居住
  住房: "居住",
  房租: "居住",
  水电: "居住",
  物业: "居住",
  // 娱乐
  玩乐: "娱乐",
  // 补剂
  保健品: "补剂",
  营养品: "补剂"
};

// Resolves a model-emitted category string to (resolved, raw). resolved is
// always a non-empty string; raw is null when the model already produced a
// canonical value. Caller-side the receipt transform uses raw != null to
// decide whether to flag the item in needs_review_reasons.
function resolveCategory(value: string): { resolved: string; raw: string | null } {
  if (CANONICAL_CATEGORIES.has(value)) return { resolved: value, raw: null };
  const alias = categoryAliasMap[value];
  if (alias) return { resolved: alias, raw: value };
  return { resolved: value, raw: value };
}

// Wave 3 polish (Low): hoist the clock-skew grace constant so it's named and
// shared with the manualExpenseSchema refinement below.
const FUTURE_DATE_GRACE_MS = 60_000;

// Wave 1 fix (Feature #11): reject dates in the future.
const notInFuture = (value: string) => {
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now() + FUTURE_DATE_GRACE_MS;
};

const receiptDateTime = z
  .string()
  .trim()
  .nullable()
  .transform((value) => {
    if (!value) return null;
    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) return value;
    // Wave 1 fix (Bug #24): treat bare strings as UTC, never local time.
    return `${value}Z`;
  })
  .pipe(
    z
      .string()
      .datetime({ offset: true })
      .nullable()
      .refine((v) => v === null || notInFuture(v), { message: "日期不能在未来" })
  );

export const extractedExpenseItemSchema = z.object({
  name_raw: z.string().trim().min(1).max(300),
  name_zh: z.string().trim().min(1).max(120),
  // Plain string here; the receipt-level transform below resolves the
  // model's output to (category_zh, category_raw) and flags coerced items
  // in needs_review_reasons. Doing it at the receipt level (not per-item)
  // keeps the "what counts as coerced" policy in one place.
  category_zh: z.string().trim().min(1).max(CATEGORY_MAX_LENGTH),
  quantity: z
    .union([z.string().trim().max(60), z.number().finite()])
    .nullable()
    .transform((value) => (value === null ? null : String(value))),
  spec_text: optionalText.default(null),
  food_amount_value: z.coerce.number().finite().positive().max(1_000_000).nullable().default(null),
  food_amount_unit: optionalShortText.default(null),
  unit_price: nullableMoney,
  discounted_unit_price: nullableMoney.default(null),
  amount: nullableMoney,
  confidence,
  notes: optionalText
});

export const extractedExpenseReceiptSchema = z
  .object({
    merchant_name: z.string().trim().min(1).max(200).nullable(),
    purchased_at: receiptDateTime,
    currency: z.string().trim().min(1).max(8).default("CNY"),
    subtotal_amount: nullableMoney.default(null),
    total_amount: nullableMoney,
    tax_amount: nullableMoney.default(0),
    processing_fee: nullableMoney.default(0),
    delivery_fee: nullableMoney.default(0),
    delivery_discount: nullableDiscountMoney.default(0),
    discount_amount: nullableDiscountMoney.default(0),
    confidence,
    model_suggested_auto_post: z.boolean().default(false),
    // OCR/model review reasons can be verbose. Do not reject an otherwise
    // valid stored receipt just because an older model wrote a long reason.
    needs_review_reasons: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
    recognition_note: optionalText,
    user_note: optionalText,
    items: z.array(extractedExpenseItemSchema).min(1).max(200)
  })
  .transform((parsed) => {
    // Walk items: resolve each category, set category_raw, and append a
    // review reason for any coerced value (alias OR unknown). Alias-only
    // coercion is also flagged so the user knows the model didn't produce
    // a canonical value verbatim.
    const MAX_REASONS = 20;
    const reviewReasons: string[] = [...parsed.needs_review_reasons];
    const resolvedItems = parsed.items.map((item) => {
      const { resolved, raw } = resolveCategory(item.category_zh);
      if (raw !== null && reviewReasons.length < MAX_REASONS) {
        const label = item.name_zh.trim() || item.name_raw.trim() || "未命名商品";
        reviewReasons.push(
          resolved !== raw
            ? `分类识别：${label} 使用了 “${raw}”，已规范为 “${resolved}”`
            : `分类识别：${label} 返回了 “${raw}”，不在标准分类中，请选择正确分类`
        );
      }
      return { ...item, category_zh: resolved, category_raw: raw };
    });
    return { ...parsed, items: resolvedItems, needs_review_reasons: reviewReasons };
  });

export const confirmExpenseReceiptSchema = z.object({
  extracted: extractedExpenseReceiptSchema,
  user_note: z.string().trim().max(1000).optional()
});

export const manualExpenseSchema = z.object({
  merchant_name: z.string().trim().min(1).max(200),
  purchased_at: receiptDateTime.pipe(
    z
      .string()
      .datetime({ offset: true })
      .refine(notInFuture, { message: "日期不能在未来" })
  ),
  currency: z.string().trim().min(1).max(8).default("CNY"),
  item_name: z.string().trim().min(1).max(120),
  category_zh: z.enum(expenseCategories),
  quantity: z
    .union([z.string().trim().max(60), z.number().finite()])
    .optional()
    .transform((value) => (value === undefined || value === "" ? "1" : String(value))),
  amount: money,
  // Wave 1 (Feature #3): manual expenses can opt out of the budget.
  excludedFromBudget: z.boolean().optional().default(false),
  notes: optionalText.default(null)
});

// Wave 3 polish (M4): single source of truth for "which fields must be filled
// before this receipt can be posted". Used by both pending-card (UI button
// gating) and store.ts (server-side guard in createTransactionFromExtracted
// and updateExpenseTransaction).
export function getBlockingFields(receipt: ExtractedExpenseReceipt): string[] {
  const blockers: string[] = [];
  if (!receipt.merchant_name?.trim()) blockers.push("商家名称");
  if (!receipt.purchased_at || Number.isNaN(Date.parse(receipt.purchased_at))) blockers.push("购买时间");
  if (receipt.total_amount === null) blockers.push("实际支付金额");
  if (receipt.items.length === 0) blockers.push("商品明细");
  if (receipt.items.some((item) => !item.name_zh.trim())) blockers.push("商品名称");
  if (receipt.items.some((item) => item.amount === null)) blockers.push("商品小计");
  return Array.from(new Set(blockers));
}

// Wave 3 subscription: Zod schema for the recurring rule payload. camelCase
// keys are intentional (matches the rest of the spec / store API); the store
// converts to snake_case for the DB row. dayOfMonth is 1-28 by design so the
// monthly tick is trivial across February / 30-day months. The .refine()
// enforces that each frequency has the day field it needs.
export const recurringFrequencySchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

export const recurringExpenseSchema = z
  .object({
    merchantName: z.string().trim().min(1).max(80),
    amountCents: z.number().int().nonnegative().max(1_000_000_00),
    currency: z.string().trim().min(1).max(8),
    categoryZh: z.string().trim().min(1).max(20),
    frequency: recurringFrequencySchema,
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    monthOfYear: z.number().int().min(1).max(12).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(500).optional(),
    excludedFromBudget: z.boolean().default(false)
  })
  .refine(
    (data) => {
      if (data.frequency === "monthly" && data.dayOfMonth === undefined) return false;
      if (data.frequency === "weekly" && data.dayOfWeek === undefined) return false;
      if (data.frequency === "yearly" && (data.monthOfYear === undefined || data.dayOfMonth === undefined)) {
        return false;
      }
      return true;
    },
    { message: "缺少对应 frequency 所需的 day / month 字段" }
  );

// Wave 3 subscription: PATCH lets the caller send any subset of editable
// fields. Frequency / day / month changes are still validated for consistency
// by the store via computeNextRun, but we don't re-run the .refine() here
// (it'd require the full shape). The store rejects bad combinations.
export const recurringExpensePatchSchema = z
  .object({
    merchantName: z.string().trim().min(1).max(80).optional(),
    amountCents: z.number().int().nonnegative().max(1_000_000_00).optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    categoryZh: z.string().trim().min(1).max(20).optional(),
    frequency: recurringFrequencySchema.optional(),
    dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    excludedFromBudget: z.boolean().optional(),
    active: z.boolean().optional()
  })
  .strict();
