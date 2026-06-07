import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  // Wave 2 feature: image compression — webp thumbnail path; falls back to imagePath if null.
  thumbnailPath: text("thumbnail_path"),
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

export const expenseReceiptJobs = sqliteTable("expense_receipt_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  imagePath: text("image_path").notNull(),
  imageMimeType: text("image_mime_type").notNull(),
  originalFilename: text("original_filename").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: text("next_attempt_at"),
  lastAttemptAt: text("last_attempt_at"),
  receiptId: integer("receipt_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type ExpenseReceiptJobRow = typeof expenseReceiptJobs.$inferSelect;

export const expenseTransactions = sqliteTable("expense_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptId: integer("receipt_id"),
  merchantName: text("merchant_name").notNull(),
  // Wave 3 polish (H5): always ISO 8601 with explicit offset/Z; string
  // comparison (range queries, month buckets, ordering) relies on it.
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
  foodAmountValue: real("food_amount_value"),
  foodAmountUnit: text("food_amount_unit"),
  unitPriceCents: integer("unit_price_cents"),
  discountedUnitPriceCents: integer("discounted_unit_price_cents"),
  amountCents: integer("amount_cents"),
  confidence: integer("confidence").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type ExpenseItemRow = typeof expenseItems.$inferSelect;

// Wave 3 dedup: SHA-256 hex of the raw receipt bytes, mapped 1:1 to the
// receipt that was created from them. Primary key on the hash gives O(1)
// duplicate checks at upload time; the receipt_id index makes the orphan
// cleanup query cheap even with many hashes.
export const receiptHashes = sqliteTable(
  "receipt_hashes",
  {
    hash: text("hash").primaryKey(),
    receiptId: integer("receipt_id")
      .notNull()
      .references(() => expenseReceipts.id),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    idxReceiptHashesReceipt: index("idx_receipt_hashes_receipt").on(table.receiptId)
  })
);

export type ReceiptHashRow = typeof receiptHashes.$inferSelect;

// Wave 3 subscription: schema — dayOfMonth is 1-28 (not 1-31) to keep the
// monthly tick simple across February + 30-day months; yearly uses the same
// restricted day range. Drizzle doesn't reliably express partial indexes in
// v0.45, so the WHERE active=1 index is created via raw SQL in src/lib/db.ts.
export const recurringExpenses = sqliteTable("recurring_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  merchantName: text("merchant_name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  categoryZh: text("category_zh").notNull(),
  frequency: text("frequency").notNull(),
  dayOfMonth: integer("day_of_month"),
  dayOfWeek: integer("day_of_week"),
  monthOfYear: integer("month_of_year"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at").notNull(),
  notes: text("notes"),
  excludedFromBudget: integer("excluded_from_budget", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type RecurringExpenseRow = typeof recurringExpenses.$inferSelect;
