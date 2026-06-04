import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import * as schema from "@/db/schema";

const dbPath = process.env.SQLITE_PATH ?? path.join(process.cwd(), "data", "app.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_records_timeline
    ON records (occurred_at DESC, id DESC);

  CREATE INDEX IF NOT EXISTS idx_records_type
    ON records (type);

  CREATE TABLE IF NOT EXISTS supplement_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplement_name TEXT NOT NULL,
    brand TEXT,
    dose_text TEXT,
    time_of_day TEXT NOT NULL,
    days_of_week TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path TEXT NOT NULL,
    image_mime_type TEXT NOT NULL,
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
    quantity TEXT,
    spec_text TEXT,
    unit_price_cents INTEGER,
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

const itemColumns = sqlite.prepare("PRAGMA table_info(expense_items)").all() as {
  name: string;
  notnull: number;
}[];
const itemColumnNames = new Set(itemColumns.map((column) => column.name));
if (!itemColumnNames.has("spec_text")) {
  sqlite.exec("ALTER TABLE expense_items ADD COLUMN spec_text TEXT");
}
const amountColumn = itemColumns.find((column) => column.name === "amount_cents");
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
      unit_price_cents INTEGER,
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
      unit_price_cents,
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
      unit_price_cents,
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

export const rawDb = sqlite;
export const db = drizzle(sqlite, { schema });
