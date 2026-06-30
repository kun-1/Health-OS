// Stage 1 nutrition scoring: per-item data-quality check. Sits between
// `classify()` and the scorers, tagging each item with the reasons it
// should be (partially) excluded from a given scorer.
//
// This module does NOT make exclusion decisions — it surfaces reasons so
// the UI can list them and the user can go fix the source receipt. Each
// scorer decides for itself what to do with the flag (e.g. PDI requires
// a weight, plate requires non-油脂 + non-water).
//
// Severity model:
//   - "ok"   — item is fully usable across all scorers
//   - "warn" — item has 1 minor reason (e.g. low OCR confidence). Use for
//              transparency, don't auto-skip.
//   - "fail" — item has a hard reason (no weight + no alias, or known
//              OCR noise). Most scorers will skip these.
//
// We deliberately do NOT auto-skip "warn" — the user wanted to know what
// is borderline, not have it hidden. Each scorer reads the flag and
// decides; today all scorers treat fail = skip, warn = use with caveat.

import type { NutritionCategory } from "@/db/schema";

export type QualityReason =
  | "no_weight" // food_amount_value is null
  | "ambiguous_unit" // unit not in g/ml/份/块
  | "no_alias_match" // classify returned 未分类
  | "low_confidence" // OCR model confidence < 0.5
  | "noise"; // known OCR noise (微信转账, 淘宝商品, ...)

export const REASON_LABELS: Record<QualityReason, string> = {
  no_weight: "无重量",
  ambiguous_unit: "单位无法换算",
  no_alias_match: "未匹配别名",
  low_confidence: "OCR 低置信度",
  noise: "OCR 噪声"
};

// Order matters: first match wins. Keep this list short — it's only for
// "this is OCR garbage, not a food item at all". Items with a real
// category but bad OCR data go through normal quality scoring instead.
const NOISE_PATTERNS = ["微信转账", "淘宝商品", "盒马超市"];

// OCR stores confidence as INTEGER 0..100 (or 0..1 in JSON depending on
// stage). Tolerate both; the threshold is on the same scale.
const LOW_CONFIDENCE_THRESHOLD = 0.5;

export type QualitySeverity = "ok" | "warn" | "fail";

export type QualityFlag = {
  reasons: QualityReason[];
  severity: QualitySeverity;
};

export type QualityInput = {
  name_zh: string;
  food_amount_value: number | null;
  food_amount_unit: string | null;
  confidence: number;
};

export type QualityClassification = {
  category: NutritionCategory;
};

// Known unit set matches the scorer (toGrams in score.ts). Items with any
// other unit are flagged ambiguous_unit and skipped from weight-based
// scorers.
const KNOWN_UNITS = new Set(["g", "ml", "份", "块"]);

export function qualityCheck(
  item: QualityInput,
  classification: QualityClassification
): QualityFlag {
  // OCR noise short-circuits to fail with a single reason. The other
  // dimensions (weight, alias) are meaningless for these items.
  if (NOISE_PATTERNS.some((p) => item.name_zh.includes(p))) {
    return { reasons: ["noise"], severity: "fail" };
  }

  const reasons: QualityReason[] = [];

  if (item.food_amount_value === null) {
    reasons.push("no_weight");
  } else if (item.food_amount_unit !== null && !KNOWN_UNITS.has(item.food_amount_unit)) {
    reasons.push("ambiguous_unit");
  }

  if (classification.category === "未分类") {
    reasons.push("no_alias_match");
  }

  if (item.confidence < LOW_CONFIDENCE_THRESHOLD) {
    reasons.push("low_confidence");
  }

  // Severity: 0 = ok, 1 = warn, 2+ = fail. Alias miss always fail (we
  // can't score what we can't classify). Noise short-circuits above.
  let severity: QualitySeverity;
  if (reasons.length === 0) {
    severity = "ok";
  } else if (
    reasons.length === 1 &&
    !reasons.includes("no_alias_match")
  ) {
    severity = "warn";
  } else {
    severity = "fail";
  }

  return { reasons, severity };
}

// Aggregate skip counts per reason. Used by the UI's "跳过 N 条" pill on
// each score card and the skipped-items panel.
export type SkipBreakdown = Record<QualityReason, number>;

export function emptySkipBreakdown(): SkipBreakdown {
  return {
    no_weight: 0,
    ambiguous_unit: 0,
    no_alias_match: 0,
    low_confidence: 0,
    noise: 0
  };
}

export function tallySkips(items: Array<{ quality: QualityFlag }>): SkipBreakdown {
  const out = emptySkipBreakdown();
  for (const item of items) {
    if (item.quality.severity === "ok") continue;
    for (const reason of item.quality.reasons) {
      out[reason] += 1;
    }
  }
  return out;
}

// (was shouldSkipForScorer — deleted: the scorers inline this check and the
// indirection wasn't pulling its weight. Re-add here only if a scorer grows
// needs that diverge from the inline form.)