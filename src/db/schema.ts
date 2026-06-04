import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type RecordRow = typeof records.$inferSelect;

export const supplementSchedules = sqliteTable("supplement_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplementName: text("supplement_name").notNull(),
  brand: text("brand"),
  doseText: text("dose_text"),
  timeOfDay: text("time_of_day").notNull(),
  daysOfWeek: text("days_of_week").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type SupplementScheduleRow = typeof supplementSchedules.$inferSelect;

export const expenseReceipts = sqliteTable("expense_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  imagePath: text("image_path").notNull(),
  imageMimeType: text("image_mime_type").notNull(),
  status: text("status").notNull(),
  rawModelJson: text("raw_model_json").notNull(),
  normalizedJson: text("normalized_json").notNull(),
  confidence: integer("confidence").notNull(),
  reviewReasonsJson: text("review_reasons_json").notNull(),
  transactionId: integer("transaction_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type ExpenseReceiptRow = typeof expenseReceipts.$inferSelect;

export const expenseTransactions = sqliteTable("expense_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptId: integer("receipt_id"),
  merchantName: text("merchant_name").notNull(),
  purchasedAt: text("purchased_at").notNull(),
  subtotalAmountCents: integer("subtotal_amount_cents"),
  totalAmountCents: integer("total_amount_cents").notNull(),
  currency: text("currency").notNull(),
  taxAmountCents: integer("tax_amount_cents").notNull(),
  processingFeeCents: integer("processing_fee_cents").notNull().default(0),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  deliveryDiscountCents: integer("delivery_discount_cents").notNull().default(0),
  discountAmountCents: integer("discount_amount_cents").notNull(),
  notes: text("notes"),
  excludedFromBudget: integer("excluded_from_budget").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type ExpenseTransactionRow = typeof expenseTransactions.$inferSelect;

export const expenseItems = sqliteTable("expense_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id").notNull(),
  nameRaw: text("name_raw").notNull(),
  nameZh: text("name_zh").notNull(),
  categoryZh: text("category_zh").notNull(),
  quantity: text("quantity"),
  specText: text("spec_text"),
  unitPriceCents: integer("unit_price_cents"),
  amountCents: integer("amount_cents"),
  confidence: integer("confidence").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type ExpenseItemRow = typeof expenseItems.$inferSelect;
