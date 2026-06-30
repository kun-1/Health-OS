// POST /api/nutrition/seed
//
// Forces a re-seed of `nutrition_food_aliases` from `seed-aliases.ts`.
// Strategy:
//   1. Delete all is_user_set = 0 rows (the old seeded rows).
//   2. Bulk-insert every pattern from seed-aliases.ts. INSERT OR IGNORE
//      protects user-set rows that happen to share the same raw_pattern.
// User-set rows are never touched.
//
// Useful after editing seed-aliases.ts to push the new patterns to a
// running dev server without a full restart.

import { NextResponse } from "next/server";

import { rawDb } from "@/lib/db";
import { forceReseed } from "@/lib/nutrition/seed";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const deleted = rawDb
    .prepare("DELETE FROM nutrition_food_aliases WHERE is_user_set = 0")
    .run();
  const inserted = forceReseed(rawDb);
  const total = (
    rawDb.prepare("SELECT COUNT(*) AS n FROM nutrition_food_aliases").get() as {
      n: number;
    }
  ).n;
  return NextResponse.json({ deleted: deleted.changes, inserted, total });
}