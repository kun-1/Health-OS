// GET /api/nutrition/preview?name_zh=...
//
// Classifies a single Chinese food name against the seeded alias table and
// returns the predicted category + colour signal + plate-exclusion flag.
// Used by the receipt-form UI to preview what bucket a new item would land
// in BEFORE the user commits the receipt. Cheap (no DB writes, single SELECT).
//
// Response shape:
//   { name_zh, category, confidence, matchedPattern,
//     color, excludedFromPlate, isUserOverridden }

import { NextResponse } from "next/server";

import { loadAliases } from "@/lib/nutrition/alias-store";
import { classify } from "@/lib/nutrition/classify";
import { colorOf } from "@/lib/nutrition/color-signals";
import { isExcludedFromPlate } from "@/lib/nutrition/score";
import { previewNameSchema } from "@/lib/nutrition/dto";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const parsed = previewNameSchema.safeParse(searchParams.get("name_zh"));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid name" },
      { status: 400 }
    );
  }
  const nameZh = parsed.data;

  const aliases = loadAliases().map((a) => ({
    rawPattern: a.rawPattern,
    category: a.category,
    isUserSet: a.isUserSet
  }));

  const result = classify(nameZh, aliases);
  const isUserOverridden = aliases.some(
    (a) => a.isUserSet === true && a.rawPattern === result.matchedPattern
  );

  return NextResponse.json({
    name_zh: nameZh,
    category: result.category,
    confidence: result.confidence,
    matchedPattern: result.matchedPattern,
    color: colorOf(nameZh),
    excludedFromPlate: isExcludedFromPlate(nameZh, result.category),
    isUserOverridden
  });
}