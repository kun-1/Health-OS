import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import * as schema from "@/db/schema";
import { seedIfEmpty } from "@/lib/nutrition/seed";

const dbPath = process.env.SQLITE_PATH ?? path.join(process.cwd(), "data", "app.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS expense_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path TEXT NOT NULL,
    image_mime_type TEXT NOT NULL,
    thumbnail_path TEXT,
    status TEXT NOT NULL,
    raw_model_json TEXT NOT NULL,
    normalized_json TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    review_reasons_json TEXT NOT NULL,
    transaction_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_expense_receipts_status
    ON expense_receipts (status, created_at DESC);

  CREATE TABLE IF NOT EXISTS expense_receipt_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL
      REFERENCES expense_receipts(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    image_mime_type TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_expense_receipt_images_receipt
    ON expense_receipt_images (receipt_id, position);

  CREATE TABLE IF NOT EXISTS expense_receipt_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path TEXT NOT NULL,
    image_mime_type TEXT NOT NULL,
    image_paths_json TEXT,
    original_filename TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    last_attempt_at TEXT,
    receipt_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_expense_receipt_jobs_status
    ON expense_receipt_jobs (status, next_attempt_at, created_at DESC);

  CREATE TABLE IF NOT EXISTS expense_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER,
    merchant_name TEXT NOT NULL,
    purchased_at TEXT NOT NULL,
    subtotal_amount_cents INTEGER,
    total_amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    tax_amount_cents INTEGER NOT NULL,
    processing_fee_cents INTEGER NOT NULL DEFAULT 0,
    delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
    delivery_discount_cents INTEGER NOT NULL DEFAULT 0,
    discount_amount_cents INTEGER NOT NULL,
    notes TEXT,
    excluded_from_budget INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_expense_transactions_purchased
    ON expense_transactions (purchased_at DESC, id DESC);

  CREATE TABLE IF NOT EXISTS expense_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    name_raw TEXT NOT NULL,
    name_zh TEXT NOT NULL,
    category_zh TEXT NOT NULL,
    category_raw TEXT,
    quantity TEXT,
    spec_text TEXT,
    food_amount_value REAL,
    food_amount_unit TEXT,
    unit_price_cents INTEGER,
    discounted_unit_price_cents INTEGER,
    amount_cents INTEGER,
    confidence INTEGER NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_expense_items_transaction
    ON expense_items (transaction_id);

  CREATE INDEX IF NOT EXISTS idx_expense_items_category
    ON expense_items (category_zh);

  CREATE TABLE IF NOT EXISTS expense_budget_settings (
    id INTEGER PRIMARY KEY,
    base_budget_cents INTEGER NOT NULL,
    primary_currency TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_budget_top_ups (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_expense_budget_top_ups_month
    ON expense_budget_top_ups (month, created_at DESC);

  CREATE TABLE IF NOT EXISTS receipt_hashes (
    hash TEXT PRIMARY KEY,
    receipt_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_receipt_hashes_receipt
    ON receipt_hashes (receipt_id);

  CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    category_zh TEXT NOT NULL,
    frequency TEXT NOT NULL,
    day_of_month INTEGER,
    day_of_week INTEGER,
    month_of_year INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    start_date TEXT NOT NULL,
    end_date TEXT,
    last_run_at TEXT,
    next_run_at TEXT NOT NULL,
    notes TEXT,
    excluded_from_budget INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Wave 3 subscription: schema — partial index so the recurring tick can
  -- scan only active rules. Drizzle's typed index() doesn't expose a clean
  -- WHERE clause in v0.45, so we keep the partial index alongside the other
  -- raw CREATE INDEX statements in this file.
  CREATE INDEX IF NOT EXISTS idx_recurring_expenses_next_run
    ON recurring_expenses (next_run_at) WHERE active = 1;

  -- Stage 1 nutrition scoring: substring → category lookup for the diet
  -- classifier. The UNIQUE on raw_pattern is what makes the seed script
  -- idempotent (INSERT OR IGNORE) and lets user-set overrides coexist with
  -- seeded rows.
  CREATE TABLE IF NOT EXISTS nutrition_food_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_pattern TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    is_user_set INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_nutrition_aliases_pattern
    ON nutrition_food_aliases (raw_pattern);

  -- Wave 4: SMS auto-entry audit / dedup table.
  CREATE TABLE IF NOT EXISTS sms_transaction_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_hash TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'sms',
    status TEXT NOT NULL,
    raw_message TEXT NOT NULL,
    transaction_id INTEGER,
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sms_records_status_created
    ON sms_transaction_records (status, created_at);

  CREATE INDEX IF NOT EXISTS idx_sms_records_transaction
    ON sms_transaction_records (transaction_id);
`);

const transactionColumns = sqlite.prepare("PRAGMA table_info(expense_transactions)").all() as {
  name: string;
}[];
const transactionColumnNames = new Set(transactionColumns.map((column) => column.name));
if (!transactionColumnNames.has("subtotal_amount_cents")) {
  sqlite.exec("ALTER TABLE expense_transactions ADD COLUMN subtotal_amount_cents INTEGER");
}
if (!transactionColumnNames.has("processing_fee_cents")) {
  sqlite.exec("ALTER TABLE expense_transactions ADD COLUMN processing_fee_cents INTEGER NOT NULL DEFAULT 0");
}
if (!transactionColumnNames.has("delivery_fee_cents")) {
  sqlite.exec("ALTER TABLE expense_transactions ADD COLUMN delivery_fee_cents INTEGER NOT NULL DEFAULT 0");
}
if (!transactionColumnNames.has("delivery_discount_cents")) {
  sqlite.exec("ALTER TABLE expense_transactions ADD COLUMN delivery_discount_cents INTEGER NOT NULL DEFAULT 0");
}

const receiptColumns = sqlite.prepare("PRAGMA table_info(expense_receipts)").all() as {
  name: string;
}[];
const receiptColumnNames = new Set(receiptColumns.map((column) => column.name));
// Wave 2 feature: image compression — backfill the thumbnail_path column for
// pre-existing installations. Mirrors the IF NOT EXISTS style used above.
// Wrapped in try/catch because Next.js bundles this module into multiple
// chunks; if two chunks race to run the ALTER, the second one would fail
// with "duplicate column name" even though the schema is correct.
if (!receiptColumnNames.has("thumbnail_path")) {
  try {
    sqlite.exec("ALTER TABLE expense_receipts ADD COLUMN thumbnail_path TEXT");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column name/i.test(message)) throw error;
  }
}

const itemColumns = sqlite.prepare("PRAGMA table_info(expense_items)").all() as {
  name: string;
  notnull: number;
}[];
const itemColumnNames = new Set(itemColumns.map((column) => column.name));
if (!itemColumnNames.has("spec_text")) {
  sqlite.exec("ALTER TABLE expense_items ADD COLUMN spec_text TEXT");
}
if (!itemColumnNames.has("discounted_unit_price_cents")) {
  sqlite.exec("ALTER TABLE expense_items ADD COLUMN discounted_unit_price_cents INTEGER");
}
if (!itemColumnNames.has("food_amount_value")) {
  sqlite.exec("ALTER TABLE expense_items ADD COLUMN food_amount_value REAL");
}
if (!itemColumnNames.has("food_amount_unit")) {
  sqlite.exec("ALTER TABLE expense_items ADD COLUMN food_amount_unit TEXT");
}
// Wave 3: track the model's raw category output so the user can see what
// the OCR guessed even after the schema coerced it to a canonical value
// (alias) or kept it as-is (unknown). Nullable — old rows just have null.
if (!itemColumnNames.has("category_raw")) {
  sqlite.exec("ALTER TABLE expense_items ADD COLUMN category_raw TEXT");
}

// Wave 3.5: backfill expense_receipt_images for ANY receipt that's missing
// sub-table rows. The Wave 3 version only ran when the sub-table was empty,
// so any receipt created BEFORE another receipt populated the sub-table got
// missed (we hit this with receipt #22 — its 2nd screenshot is orphaned on
// disk, the parent row has image_path, but the sub-table is empty so the
// carousel shows only 1 image).
//
// Two cases to handle:
//   1. Single-image receipts (job has no image_paths_json, or it's NULL) —
//      fall back to the parent's image_path + image_mime_type at position 0.
//   2. Multi-image receipts (job has image_paths_json with N entries) —
//      re-create N rows in upload order so the carousel matches the user's
//      intended screenshot sequence.
//
// Idempotent: WHERE NOT EXISTS guards make re-runs a no-op. Runs on every
// app start (cheap — the NOT EXISTS + LIMIT 1 makes it bail immediately when
// nothing's missing).
const orphanReceipts = sqlite
  .prepare(
    `SELECT r.id, r.image_path, r.image_mime_type, r.created_at, j.image_paths_json
     FROM expense_receipts r
     LEFT JOIN expense_receipt_jobs j ON j.receipt_id = r.id
     WHERE NOT EXISTS (SELECT 1 FROM expense_receipt_images i WHERE i.receipt_id = r.id)
     ORDER BY r.id`
  )
  .all() as Array<{
    id: number;
    image_path: string;
    image_mime_type: string;
    created_at: string;
    image_paths_json: string | null;
  }>;
if (orphanReceipts.length > 0) {
  const backfillInsert = sqlite.prepare(
    `INSERT INTO expense_receipt_images (receipt_id, image_path, image_mime_type, position, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const backfillMany = sqlite.transaction((rows: typeof orphanReceipts) => {
    for (const row of rows) {
      const paths = (() => {
        if (!row.image_paths_json) return null;
        try {
          const parsed = JSON.parse(row.image_paths_json);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      })();
      const entries: Array<{ path: string; mime: string }> =
        paths && paths.length > 0
          ? paths
          : [{ path: row.image_path, mime: row.image_mime_type }];
      entries.forEach((entry, index) => {
        backfillInsert.run(row.id, entry.path, entry.mime, index, row.created_at);
      });
    }
  });
  backfillMany(orphanReceipts);
  console.info(`[expenses:backfill] populated expense_receipt_images for ${orphanReceipts.length} receipt(s)`);
}

// Wave 3 multi-image: ALTER expense_receipt_jobs to add the JSON column for
// multi-image jobs. Existing rows keep image_path/image_mime_type as their
// single source of truth; the JSON column stays NULL and the store layer
// synthesises a 1-element array at read time.
const jobColumns = sqlite.prepare("PRAGMA table_info(expense_receipt_jobs)").all() as {
  name: string;
}[];
const jobColumnNames = new Set(jobColumns.map((column) => column.name));
if (!jobColumnNames.has("image_paths_json")) {
  try {
    sqlite.exec("ALTER TABLE expense_receipt_jobs ADD COLUMN image_paths_json TEXT");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column name/i.test(message)) throw error;
  }
}
const amountColumn = itemColumns.find((column) => column.name === "amount_cents");
// Wave 3 polish (Low): pre-Wave 1 installs have amount_cents NOT NULL, which
// blocks rows where the OCR could not detect a per-item amount. We rebuild
// the table with the column nullable, copying rows verbatim (NULLs in old
// rows remain NULL). The block is idempotent: once amountColumn.notnull is
// false the if() short-circuits and we never run the rebuild again.
if (amountColumn?.notnull) {
  sqlite.exec(`
    ALTER TABLE expense_items RENAME TO expense_items_old;

    CREATE TABLE expense_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      name_raw TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      category_zh TEXT NOT NULL,
      quantity TEXT,
      spec_text TEXT,
      food_amount_value REAL,
      food_amount_unit TEXT,
      unit_price_cents INTEGER,
      discounted_unit_price_cents INTEGER,
      amount_cents INTEGER,
      confidence INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO expense_items (
      id,
      transaction_id,
      name_raw,
      name_zh,
      category_zh,
      quantity,
      spec_text,
      food_amount_value,
      food_amount_unit,
      unit_price_cents,
      discounted_unit_price_cents,
      amount_cents,
      confidence,
      notes,
      created_at,
      updated_at
    )
    SELECT
      id,
      transaction_id,
      name_raw,
      name_zh,
      category_zh,
      quantity,
      CASE WHEN EXISTS (SELECT 1 FROM pragma_table_info('expense_items_old') WHERE name = 'spec_text') THEN spec_text ELSE NULL END,
      CASE WHEN EXISTS (SELECT 1 FROM pragma_table_info('expense_items_old') WHERE name = 'food_amount_value') THEN food_amount_value ELSE NULL END,
      CASE WHEN EXISTS (SELECT 1 FROM pragma_table_info('expense_items_old') WHERE name = 'food_amount_unit') THEN food_amount_unit ELSE NULL END,
      unit_price_cents,
      CASE WHEN EXISTS (SELECT 1 FROM pragma_table_info('expense_items_old') WHERE name = 'discounted_unit_price_cents') THEN discounted_unit_price_cents ELSE NULL END,
      amount_cents,
      confidence,
      notes,
      created_at,
      updated_at
    FROM expense_items_old;

    DROP TABLE expense_items_old;

    CREATE INDEX IF NOT EXISTS idx_expense_items_transaction
      ON expense_items (transaction_id);

    CREATE INDEX IF NOT EXISTS idx_expense_items_category
      ON expense_items (category_zh);
  `);
}

// Stage 1: drop the legacy `records` and `supplement_schedules` tables. They
// powered the old "health record layer" (chronic disease tracking, sleep,
// meals, bowel, etc.) which the user no longer uses. Backups of the records
// payload_json live at data/data-records-backup.sql if anything ever needs
// recovering. Guarded by sqlite_master so this runs exactly once per install:
// on first boot the SELECT returns rows, the DROP runs, and on every
// subsequent boot the SELECT returns 0 rows and the block is skipped.
const deadTables = sqlite
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('records','supplement_schedules')"
  )
  .all() as { name: string }[];
if (deadTables.length > 0) {
  sqlite.exec(`
    DROP INDEX IF EXISTS idx_records_timeline;
    DROP INDEX IF EXISTS idx_records_type;
    DROP TABLE IF EXISTS records;
    DROP TABLE IF EXISTS supplement_schedules;
  `);
}

// Stage 1: bootstrap the nutrition food aliases. Only runs when the table
// is empty so user overrides survive subsequent boots. To force a re-seed
// (after editing seed-aliases.ts), POST /api/nutrition/seed.
const seeded = seedIfEmpty(sqlite);
if (seeded > 0) {
  console.info(`[nutrition:seed] inserted ${seeded} alias rows`);
}

export const rawDb = sqlite;
export const db = drizzle(sqlite, { schema });
