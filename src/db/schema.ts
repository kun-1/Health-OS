import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Stage 1 nutrition scoring: substring patterns used to bucket expense_items
// into plant-based / animal / ultra-processed groups. `raw_pattern` matches via
// name_zh.includes(); user-set rows override seeded ones on tie.
//
// `油脂` (cooking oils) is intentionally separate from "未分类" so the
// Harvard plate scorer can filter oils out — a 500 g bottle of oil would
// otherwise dominate the "other" bucket and skew the ratio.
export const nutritionCategories = [
  "蔬菜",
  "水果",
  "全谷物",
  "豆类",
  "坚果",
  "香料",
  "动物性",
  "油脂",
  "含糖饮料",
  "加工肉",
  "反式零食",
  "未分类"
] as const;

export type NutritionCategory = (typeof nutritionCategories)[number];

export const nutritionFoodAliases = sqliteTable(
  "nutrition_food_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rawPattern: text("raw_pattern").notNull().unique(),
    category: text("category", { enum: nutritionCategories }).notNull(),
    isUserSet: integer("is_user_set").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    idxAliasPattern: index("idx_nutrition_aliases_pattern").on(table.rawPattern)
  })
);

export type NutritionFoodAliasRow = typeof nutritionFoodAliases.$inferSelect;

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
  // Wave 3 multi-image: JSON-serialised [{path, mime}] for N-image jobs.
  // Nullable for backward compat with legacy single-image rows (which
  // synthesise a 1-element array at read time). `image_path`/`image_mime_type`
  // above stay as the FIRST image for legacy queue-UI code.
  imagePathsJson: text("image_paths_json"),
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
  // Wave 3: model's raw category output, populated by the schema transform
  // when category_zh was coerced (alias or unknown). Null when the model
  // already produced a canonical value. Old rows have null.
  categoryRaw: text("category_raw"),
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

export const expenseBudgetSettings = sqliteTable("expense_budget_settings", {
  id: integer("id").primaryKey(),
  baseBudgetCents: integer("base_budget_cents").notNull(),
  primaryCurrency: text("primary_currency").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type ExpenseBudgetSettingsRow = typeof expenseBudgetSettings.$inferSelect;

export const expenseBudgetTopUps = sqliteTable(
  "expense_budget_top_ups",
  {
    id: text("id").primaryKey(),
    month: text("month").notNull(),
    amountCents: integer("amount_cents").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    idxExpenseBudgetTopUpsMonth: index("idx_expense_budget_top_ups_month").on(table.month, table.createdAt)
  })
);

export type ExpenseBudgetTopUpRow = typeof expenseBudgetTopUps.$inferSelect;

// Wave 3: a receipt can have N images (1:N). Used for the multi-screenshot
// flow where a single shopping order is split across 2-3 mobile screenshots.
// `position` is 0-based display order so the uploader's intent survives a
// reload. Receipts always have at least one row here; the legacy
// expense_receipts.image_path is kept only for backward compat with rows
// that pre-date this table — a startup migration backfills it.
export const expenseReceiptImages = sqliteTable("expense_receipt_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptId: integer("receipt_id")
    .notNull()
    .references(() => expenseReceipts.id, { onDelete: "cascade" }),
  imagePath: text("image_path").notNull(),
  imageMimeType: text("image_mime_type").notNull(),
  position: integer("position").notNull(),
  createdAt: text("created_at").notNull()
});

export type ExpenseReceiptImageRow = typeof expenseReceiptImages.$inferSelect;

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
