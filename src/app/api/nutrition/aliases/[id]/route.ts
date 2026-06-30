// PATCH /api/nutrition/aliases/[id]
//
// Updates the category of one alias row. The user-set flag flips to 1 so
// subsequent re-seeds won't clobber the override. Stage 1.1 will replace
// this with a fuller management UI; for stage 1 the endpoint is enough to
// support manual correction via curl.

import { NextResponse } from "next/server";

import { rawDb } from "@/lib/db";
import { patchAliasBodySchema } from "@/lib/nutrition/dto";
import type { AliasRow } from "@/lib/nutrition/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchAliasBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const existing = rawDb
    .prepare("SELECT id FROM nutrition_food_aliases WHERE id = ?")
    .get(id);
  if (!existing) {
    return NextResponse.json({ error: "Alias not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  rawDb
    .prepare(
      "UPDATE nutrition_food_aliases SET category = ?, is_user_set = 1, updated_at = ? WHERE id = ?"
    )
    .run(parsed.data.category, now, id);

  const updated = rawDb
    .prepare(
      "SELECT id, raw_pattern AS rawPattern, category, is_user_set AS isUserSet, created_at AS createdAt, updated_at AS updatedAt FROM nutrition_food_aliases WHERE id = ?"
    )
    .get(id) as AliasRow;
  return NextResponse.json(updated);
}