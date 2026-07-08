// Stage 1 nutrition scoring: shared domain types. Pure data; no logic here.
//
// All result shapes intentionally mirror `src/lib/expenses/types.ts` so the
// nutrition dashboard can reuse the same formatter + serialiser helpers.

import type { NutritionCategory } from "@/db/schema";
import type { ColorCounts, RainbowColor } from "@/lib/nutrition/color-signals";
import type { QualityReason, QualitySeverity, SkipBreakdown } from "@/lib/nutrition/quality";

export type { NutritionCategory };
export type { ColorCounts, RainbowColor };
export type { QualityReason, QualitySeverity, SkipBreakdown };

export type CategoryResult = {
  category: NutritionCategory;
  // 0..1 — pattern-length-based; never a model confidence signal. User-set
  // overrides carry higher trust than seeded rows of the same length.
  confidence: number;
  matchedPattern: string | null;
};

export type PdiComponent = {
  grams: number;
  // Monthly purchase grams for this plant group. Renamed from gPerDay:
  // purchases ≠ consumption, so per-day normalisation was misleading. The
  // score itself still uses grams / (dailyTh × days) — see score.ts comment.
  gramsThisPeriod: number;
  score: number; // 0..10
};

export type PdiResult = {
  total: number;
  max: 60;
  breakdown: {
    蔬菜: PdiComponent;
    水果: PdiComponent;
    全谷物: PdiComponent;
    豆类: PdiComponent;
    坚果: PdiComponent;
    香料: PdiComponent;
  };
  // grams considered for plant groups / grams across ALL food items (used to
  // surface the "X% data coverage" line in the UI).
  coveragePct: number;
};

export type PlateResult = {
  plate: {
    vegFruit: number; // 蔬菜 + 水果
    wholeGrain: number; // 全谷物
    protein: number; // 豆类 + 坚果 + 动物性
    other: number; // 淀粉类蔬菜 + 精制谷物 + 未分类 + 含糖饮料 + 加工肉 + 甜点 + 香料
  };
  ratios: {
    vegFruit: number;
    wholeGrain: number;
    protein: number;
    other: number;
  };
  ideal: {
    vegFruit: 0.5;
    wholeGrain: 0.25;
    protein: 0.25;
    other: 0;
  };
  deviation: number; // sum of |ratios[k] - ideal[k]|
  grade: "好" | "可" | "差";
  coveragePct: number;
};

export type UpfResult = {
  upfWeight: number;
  totalWeight: number;
  upfShare: number; // 0..1
  grade: "好" | "可" | "差";
  coveragePct: number;
};

export type AheiComponent = {
  score: number; // 0..10
  // Monthly purchase grams: positive = this component's good group; reverse =
  // this component's bad group; neutral stubs = 0. Renamed from gramsPerDay
  // for the same reason as PdiComponent.gramsThisPeriod above.
  gramsThisPeriod: number;
  stub?: boolean; // true for sodium / alcohol / PUFA — always scored 5
};

export type AheiResult = {
  total: number;
  max: 110;
  breakdown: {
    蔬菜: AheiComponent;
    水果: AheiComponent;
    全谷物: AheiComponent;
    豆类坚果: AheiComponent;
    "ω-3": AheiComponent;
    加工肉: AheiComponent;
    含糖饮料: AheiComponent;
    反式脂肪: AheiComponent;
    钠: AheiComponent;
    酒精: AheiComponent;
    多不饱和脂肪: AheiComponent;
  };
  coveragePct: number;
};

export type CategoryTopItem = {
  name: string;
  grams: number;
  cents: number;
};

// A single item the scorers skipped. Carries enough context for the UI
// to render a "this didn't count" row and link back to the source
// receipt (so the user can fix weight/alias/OCR data).
export type SkippedItem = {
  itemId: number;
  transactionId: number;
  receiptId: number | null;
  merchantName: string;
  purchasedAt: string;
  nameZh: string;
  category: NutritionCategory;
  classificationConfidence: number;
  matchedPattern: string | null;
  foodAmountValue: number | null;
  foodAmountUnit: string | null;
  grams: number | null;
  cents: number;
  itemConfidence: number;
  reasons: QualityReason[];
  severity: QualitySeverity;
};

export type NutritionReport = {
  period: string; // YYYY-MM
  days: number; // days in period (28..31)
  itemsAnalyzed: number;
  itemsWithWeight: number;
  coveragePct: number;
  // Layer 1 → Layer 2 audit trail. Per-reason tally + the actual list
  // of skipped items so the user can see what didn't count and why.
  skipBreakdown: SkipBreakdown;
  skippedItems: SkippedItem[];
  topByCategory: Record<NutritionCategory, CategoryTopItem[]>;
  // Rainbow diet: count of distinct items per colour bucket. Empty buckets
  // are still present (set to 0) so the UI can render all 6 rows.
  colorCounts: ColorCounts;
  // Plate score after filtering out 油脂 + water-pattern items. Surfaced
  // for the dashboard's coverage line.
  plateFilteredGrams: number;
  pdi: PdiResult;
  plate: PlateResult;
  upf: UpfResult;
  ahei: AheiResult;
};

export type AliasRow = {
  id: number;
  rawPattern: string;
  category: NutritionCategory;
  isUserSet: boolean;
  createdAt: string;
  updatedAt: string;
};
