import { z } from "zod";

import { expenseCategories } from "@/lib/expenses/types";
import type { ExtractedExpenseReceipt } from "@/lib/expenses/types";

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
  category_zh: z.enum(expenseCategories),
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

export const extractedExpenseReceiptSchema = z.object({
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
  needs_review_reasons: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  recognition_note: optionalText,
  user_note: optionalText,
  items: z.array(extractedExpenseItemSchema).min(1).max(200)
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
