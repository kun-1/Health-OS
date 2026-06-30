// GET /api/nutrition/aliases
//
// Returns all food→category mapping rows. Used by the alias management UI
// (stage 1.1) and any future bulk-edit flow.

import { NextResponse } from "next/server";

import { rawDb } from "@/lib/db";
import type { AliasRow } from "@/lib/nutrition/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const rows = rawDb
    .prepare(
      "SELECT id, raw_pattern AS rawPattern, category, is_user_set AS isUserSet, created_at AS createdAt, updated_at AS updatedAt FROM nutrition_food_aliases ORDER BY is_user_set DESC, raw_pattern ASC"
    )
    .all() as AliasRow[];
  return NextResponse.json({ aliases: rows });
}