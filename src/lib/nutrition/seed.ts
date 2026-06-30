// Stage 1 nutrition scoring: bootstrap seed for `nutrition_food_aliases`.
//
// Called from `src/lib/db.ts` after the table is created. The seed only
// runs when the table is empty so:
//   - first install → seeds happen automatically on next dev/start
//   - user overrides → survive subsequent boots (we don't touch them)
//   - manual reseed → user runs the POST /api/nutrition/seed endpoint
//
// The `is_user_set = 0` flag on every seeded row is what makes the
// "INSERT OR IGNORE on (raw_pattern, is_user_set=0)" safe: if the user
// later overrides a seeded pattern, the override stays put on re-seed
// because we only insert when the row is missing AND not user-set.

import type Database from "better-sqlite3";

import { seedAliases } from "@/lib/nutrition/seed-aliases";

const SELECT_COUNT = "SELECT COUNT(*) AS n FROM nutrition_food_aliases";

function insertAll(
  sqlite: Database.Database,
  entries: ReadonlyArray<{ rawPattern: string; category: string }>
): number {
  const now = new Date().toISOString();
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO nutrition_food_aliases
       (raw_pattern, category, is_user_set, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?)`
  );

  const insertMany = sqlite.transaction(
    (rows: ReadonlyArray<{ rawPattern: string; category: string }>) => {
      for (const entry of rows) {
        insert.run(entry.rawPattern, entry.category, now, now);
      }
    }
  );
  insertMany(entries);
  return entries.length;
}

export function seedIfEmpty(sqlite: Database.Database): number {
  const row = sqlite.prepare(SELECT_COUNT).get() as { n: number };
  if (row.n > 0) return 0;
  return insertAll(sqlite, seedAliases);
}

// Re-seed helper: caller is expected to have wiped is_user_set = 0 rows
// already (see /api/nutrition/seed). We just bulk-insert every entry from
// the seed file; the OR IGNORE protects user-set rows that may have the
// same raw_pattern.
export function forceReseed(sqlite: Database.Database): number {
  return insertAll(sqlite, seedAliases);
}