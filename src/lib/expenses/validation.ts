import { z } from "zod";

import { expenseCategories } from "@/lib/expenses/types";

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

function localOffsetSuffix(): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const minutes = String(absoluteOffset % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

const receiptDateTime = z
  .string()
  .trim()
  .nullable()
  .transform((value) => {
    if (!value) return null;
    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) return value;
    return `${value}${localOffsetSuffix()}`;
  })
  .pipe(z.string().datetime({ offset: true }).nullable());

export const extractedExpenseItemSchema = z.object({
  name_raw: z.string().trim().min(1).max(300),
  name_zh: z.string().trim().min(1).max(120),
  category_zh: z.enum(expenseCategories),
  quantity: z
    .union([z.string().trim().max(60), z.number().finite()])
    .nullable()
    .transform((value) => (value === null ? null : String(value))),
  spec_text: optionalText.default(null),
  unit_price: nullableMoney,
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
