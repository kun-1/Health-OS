// Stage 1 nutrition scoring: shared alias loader for API routes. Lifted
// out of route handlers so `score/route.ts` can stay focused on GET-only
// exports (Next.js App Router rejects any non-HTTP-method re-export from a
// route file).

import { rawDb } from "@/lib/db";
import type { AliasRow } from "@/lib/nutrition/types";

export function loadAliases(): AliasRow[] {
  return rawDb
    .prepare(
      "SELECT id, raw_pattern AS rawPattern, category, is_user_set AS isUserSet, created_at AS createdAt, updated_at AS updatedAt FROM nutrition_food_aliases"
    )
    .all() as AliasRow[];
}