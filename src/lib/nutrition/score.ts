// Stage 1 nutrition scoring: 4 dimension scorers + period aggregator.
//
// Pure functions where possible. DB access is centralised in `loadItemsForPeriod`
// so the scorers stay unit-testable.
//
// Important nuance: the original literature thresholds (Satija PDI, AHEI)
// are calibrated to DAILY intake. Our input is MONTHLY purchases. The
// scorers therefore multiply daily thresholds by `daysInPeriod` so that
// "buying 12 kg of vegetables in June" can plausibly score 10/10. This is a
// deliberate simplification; the UI must surface this in sub-text.

import { rawDb } from "@/lib/db";
import { classify, type ClassifyInput } from "@/lib/nutrition/classify";
import {
  colorOf,
  emptyColorCounts,
  type ColorCounts,
  type RainbowColor
} from "@/lib/nutrition/color-signals";
import {
  qualityCheck,
  tallySkips,
  type QualityFlag
} from "@/lib/nutrition/quality";
import type {
  AheiResult,
  CategoryTopItem,
  NutritionReport,
  PdiResult,
  PlateResult,
  SkippedItem,
  UpfResult
} from "@/lib/nutrition/types";
import type { NutritionCategory } from "@/db/schema";

// ---- DB query -----------------------------------------------------------

export type PeriodItem = {
  id: number;
  name_zh: string;
  food_amount_value: number | null;
  food_amount_unit: string | null;
  amount_cents: number | null;
  confidence: number;
  transaction_id: number;
  receipt_id: number | null;
  merchant_name: string;
  purchased_at: string;
};

export function loadItemsForPeriod(period: string): PeriodItem[] {
  // YYYY-MM prefix matches both UTC and +offset timestamps because we filter
  // by LIKE on the ISO prefix. The 1-day padding on each side catches
  // timezone-edge purchases that straddle month boundaries.
  const startPrefix = period;
  const start = `${startPrefix}-01`;
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  return rawDb
    .prepare(
      `SELECT ei.id, ei.name_zh, ei.food_amount_value, ei.food_amount_unit,
              ei.amount_cents, ei.confidence, et.id AS transaction_id, et.receipt_id,
              et.merchant_name, et.purchased_at
       FROM expense_items ei
       JOIN expense_transactions et ON et.id = ei.transaction_id
       WHERE et.purchased_at >= ? AND et.purchased_at < ?
         AND ei.category_zh IN ('食物','外食','饮料/咖啡')`
    )
    .all(start, end) as PeriodItem[];
}

// ---- Unit conversion ----------------------------------------------------

export function toGrams(value: number, unit: string | null): number | null {
  if (!unit) return null;
  if (unit === "g" || unit === "ml") return value;
  if (unit === "份") return value * 200;
  if (unit === "块") return value * 50;
  return null;
}

// ---- Date helpers -------------------------------------------------------

export function daysInPeriod(period: string): number {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  // Day 0 of next month = last day of this month. Works for all months and
  // for December → January of next year.
  return new Date(year, month, 0).getDate();
}

// ---- Per-item classification cache --------------------------------------

// Items matching any of these substrings are excluded from the Harvard plate
// computation. Two reasons:
//   1. 油脂 (cooking oil) — a single 500 g bottle would dominate the "other"
//      bucket and skew the ratio.
//   2. 水 — water isn't food, so it doesn't belong on a plate even if the
//      user bought 16 kg of bottled water.
const PLATE_EXCLUDED_NAME_PATTERNS = ["纯净水", "矿泉水", "饮用水", "蒸馏水"];
const PLATE_EXCLUDED_CATEGORIES = new Set<NutritionCategory>(["油脂"]);

export function isExcludedFromPlate(nameZh: string, category: NutritionCategory): boolean {
  if (PLATE_EXCLUDED_CATEGORIES.has(category)) return true;
  return PLATE_EXCLUDED_NAME_PATTERNS.some((p) => nameZh.includes(p));
}

type ClassifiedItem = {
  id: number;
  transactionId: number;
  receiptId: number | null;
  nameZh: string;
  category: NutritionCategory;
  classificationConfidence: number;
  matchedPattern: string | null;
  foodAmountValue: number | null;
  foodAmountUnit: string | null;
  grams: number | null;
  cents: number;
  itemConfidence: number;
  merchantName: string;
  purchasedAt: string;
  color: RainbowColor | null;
  excludedFromPlate: boolean;
  quality: QualityFlag;
};

function classifyAll(
  items: PeriodItem[],
  aliases: ReadonlyArray<ClassifyInput>
): ClassifiedItem[] {
  const cache = new Map<string, ReturnType<typeof classify>>();
  return items.map((item) => {
    const cached = cache.get(item.name_zh);
    const result = cached ?? classify(item.name_zh, aliases);
    if (!cached) cache.set(item.name_zh, result);
    const grams =
      item.food_amount_value !== null
        ? toGrams(item.food_amount_value, item.food_amount_unit)
        : null;
    const classification = { category: result.category };
    return {
      id: item.id,
      transactionId: item.transaction_id,
      receiptId: item.receipt_id,
      merchantName: item.merchant_name,
      purchasedAt: item.purchased_at,
      nameZh: item.name_zh,
      category: result.category,
      classificationConfidence: result.confidence,
      matchedPattern: result.matchedPattern,
      foodAmountValue: item.food_amount_value,
      foodAmountUnit: item.food_amount_unit,
      grams,
      cents: item.amount_cents ?? 0,
      itemConfidence: item.confidence,
      color: colorOf(item.name_zh),
      excludedFromPlate: isExcludedFromPlate(item.name_zh, result.category),
      quality: qualityCheck(
        {
          name_zh: item.name_zh,
          food_amount_value: item.food_amount_value,
          food_amount_unit: item.food_amount_unit,
          confidence: item.confidence
        },
        classification
      )
    };
  });
}

// ---- PDI (simplified Satija) -------------------------------------------

const PDI_DAILY_THRESHOLD_G: Record<string, number> = {
  蔬菜: 400,
  水果: 300,
  全谷物: 90,
  豆类: 75,
  坚果: 20,
  香料: 5
};

function scorePdi(
  classified: ClassifiedItem[],
  days: number
): PdiResult {
  const totals: Record<string, number> = {
    蔬菜: 0,
    水果: 0,
    全谷物: 0,
    豆类: 0,
    坚果: 0,
    香料: 0
  };
  let contributed = 0;
  for (const item of classified) {
    if (item.grams === null) continue;
    if (item.quality.severity === "fail") continue;
    if (item.category in totals) {
      totals[item.category] += item.grams;
      contributed += 1;
    }
  }

  const breakdown = {} as PdiResult["breakdown"];
  let total = 0;
  for (const key of Object.keys(PDI_DAILY_THRESHOLD_G)) {
    const grams = totals[key];
    const thresholdMonthly = PDI_DAILY_THRESHOLD_G[key] * days;
    const score = clamp((grams / thresholdMonthly) * 10, 0, 10);
    breakdown[key as keyof typeof breakdown] = {
      grams,
      gramsThisPeriod: grams,
      score: round1(score)
    };
    total += score;
  }

  const denom = classified.length;
  return {
    total: round1(total),
    max: 60,
    breakdown,
    coveragePct: denom > 0 ? round1(contributed / denom) : 0
  };
}

// ---- Harvard Healthy Eating Plate ---------------------------------------

function scorePlate(
  classified: ClassifiedItem[]
): PlateResult {
  let vegFruit = 0;
  let wholeGrain = 0;
  let protein = 0;
  let other = 0;
  let contributed = 0;
  for (const item of classified) {
    if (item.grams === null) continue;
    if (item.quality.severity === "fail") continue;
    // Filter 油脂 + water-pattern items before computing the ratio. Without
    // this a 500 g bottle of oil or a 16 kg case of bottled water would push
    // `other` past 90% and grade the plate "差" even if the rest of the
    // basket was perfectly balanced.
    if (item.excludedFromPlate) continue;
    contributed += 1;
    switch (item.category) {
      case "蔬菜":
      case "水果":
        vegFruit += item.grams;
        break;
      case "全谷物":
        wholeGrain += item.grams;
        break;
      case "豆类":
      case "坚果":
      case "动物性":
        protein += item.grams;
        break;
      default:
        other += item.grams;
    }
  }
  const sum = vegFruit + wholeGrain + protein + other;
  const ratios = {
    vegFruit: sum > 0 ? vegFruit / sum : 0,
    wholeGrain: sum > 0 ? wholeGrain / sum : 0,
    protein: sum > 0 ? protein / sum : 0,
    other: sum > 0 ? other / sum : 0
  };
  const ideal = { vegFruit: 0.5, wholeGrain: 0.25, protein: 0.25, other: 0 } as const;
  const deviation =
    Math.abs(ratios.vegFruit - ideal.vegFruit) +
    Math.abs(ratios.wholeGrain - ideal.wholeGrain) +
    Math.abs(ratios.protein - ideal.protein) +
    Math.abs(ratios.other - ideal.other);
  const grade: PlateResult["grade"] =
    deviation < 0.2 ? "好" : deviation < 0.4 ? "可" : "差";
  const denom = classified.length;
  return {
    plate: { vegFruit, wholeGrain, protein, other },
    ratios,
    ideal,
    deviation: round1(deviation),
    grade,
    coveragePct: denom > 0 ? round1(contributed / denom) : 0
  };
}

function plateFilteredGrams(classified: ClassifiedItem[]): number {
  let sum = 0;
  for (const item of classified) {
    if (item.excludedFromPlate) continue;
    if (item.grams === null) continue;
    if (item.quality.severity === "fail") continue;
    sum += item.grams;
  }
  return sum;
}

// ---- Ultra-processed share ---------------------------------------------

const UPF_CATEGORIES = new Set<NutritionCategory>([
  "含糖饮料",
  "加工肉",
  "反式零食"
]);

function scoreUpf(
  classified: ClassifiedItem[]
): UpfResult {
  let upfWeight = 0;
  let denomWeight = 0;
  let contributed = 0;
  for (const item of classified) {
    if (item.grams === null) continue;
    if (item.quality.severity === "fail") continue;
    denomWeight += item.grams;
    contributed += 1;
    if (UPF_CATEGORIES.has(item.category)) upfWeight += item.grams;
  }
  const upfShare = denomWeight > 0 ? upfWeight / denomWeight : 0;
  const grade: UpfResult["grade"] =
    upfShare < 0.1 ? "好" : upfShare < 0.25 ? "可" : "差";
  const denom = classified.length;
  return {
    upfWeight,
    totalWeight: denomWeight,
    upfShare: round1(upfShare),
    grade,
    coveragePct: denom > 0 ? round1(contributed / denom) : 0
  };
}

// ---- AHEI (simplified, 11 components) -----------------------------------

// Each component: grams/day at which the score reaches 10 (or 0 for reverse
// components). Multiplied by `days` at score time.
const AHEI_POSITIVE_THRESHOLD_G_PER_DAY: Record<string, number> = {
  蔬菜: 400,
  水果: 300,
  全谷物: 90,
  豆类坚果: 75, // 豆类 + 坚果
  "ω-3": 30 // 三文鱼 / 鲈鱼 / ... aliases — see omega-3 detection below
};

const AHEI_REVERSE_THRESHOLD_G_PER_DAY: Record<string, number> = {
  加工肉: 30,
  含糖饮料: 250,
  反式脂肪: 10
};

const OMEGA3_PATTERNS = ["三文鱼", "鲈鱼", "鳕鱼", "沙丁鱼", "金枪鱼", "鲑鱼", "秋刀鱼"];

function isOmega3Name(name: string): boolean {
  return OMEGA3_PATTERNS.some((p) => name.includes(p));
}

function scoreAhei(
  items: PeriodItem[],
  classified: ClassifiedItem[],
  days: number
): AheiResult {
  // Positive grams per category per day (raw, not yet normalised).
  let vegG = 0;
  let fruitG = 0;
  let grainG = 0;
  let legumeNutG = 0;
  let omega3G = 0;
  let processedMeatG = 0;
  let ssbG = 0;
  let transG = 0;
  let contributed = 0;
  for (let i = 0; i < classified.length; i += 1) {
    const c = classified[i];
    if (c.grams === null) continue;
    if (c.quality.severity === "fail") continue;
    const name = items[i].name_zh;
    contributed += 1;
    switch (c.category) {
      case "蔬菜":
        vegG += c.grams;
        break;
      case "水果":
        fruitG += c.grams;
        break;
      case "全谷物":
        grainG += c.grams;
        break;
      case "豆类":
      case "坚果":
        legumeNutG += c.grams;
        break;
      case "加工肉":
        processedMeatG += c.grams;
        break;
      case "含糖饮料":
        ssbG += c.grams;
        break;
      case "反式零食":
        transG += c.grams;
        break;
      default:
        break;
    }
    if (isOmega3Name(name)) omega3G += c.grams;
  }

  const positive = (grams: number, dailyTh: number): number => {
    const monthlyTh = dailyTh * days;
    return clamp((grams / monthlyTh) * 10, 0, 10);
  };
  const reverse = (grams: number, dailyTh: number): number => {
    const monthlyTh = dailyTh * days;
    return clamp(10 - (grams / monthlyTh) * 10, 0, 10);
  };

  const components: AheiResult["breakdown"] = {
    蔬菜: { score: round1(positive(vegG, AHEI_POSITIVE_THRESHOLD_G_PER_DAY["蔬菜"])), gramsThisPeriod: vegG },
    水果: { score: round1(positive(fruitG, AHEI_POSITIVE_THRESHOLD_G_PER_DAY["水果"])), gramsThisPeriod: fruitG },
    全谷物: { score: round1(positive(grainG, AHEI_POSITIVE_THRESHOLD_G_PER_DAY["全谷物"])), gramsThisPeriod: grainG },
    豆类坚果: { score: round1(positive(legumeNutG, AHEI_POSITIVE_THRESHOLD_G_PER_DAY["豆类坚果"])), gramsThisPeriod: legumeNutG },
    "ω-3": { score: round1(positive(omega3G, AHEI_POSITIVE_THRESHOLD_G_PER_DAY["ω-3"])), gramsThisPeriod: omega3G },
    加工肉: { score: round1(reverse(processedMeatG, AHEI_REVERSE_THRESHOLD_G_PER_DAY["加工肉"])), gramsThisPeriod: processedMeatG },
    含糖饮料: { score: round1(reverse(ssbG, AHEI_REVERSE_THRESHOLD_G_PER_DAY["含糖饮料"])), gramsThisPeriod: ssbG },
    反式脂肪: { score: round1(reverse(transG, AHEI_REVERSE_THRESHOLD_G_PER_DAY["反式脂肪"])), gramsThisPeriod: transG },
    // Sodium / alcohol / PUFA have no data source — explicit stubs. Each
    // returns a neutral 5/10; UI must surface this so the user knows the
    // total of 110 is artificially high by up to 15 points.
    钠: { score: 5, gramsThisPeriod: 0, stub: true },
    酒精: { score: 5, gramsThisPeriod: 0, stub: true },
    多不饱和脂肪: { score: 5, gramsThisPeriod: 0, stub: true }
  };

  let total = 0;
  for (const c of Object.values(components)) total += c.score;

  const denom = classified.length;
  return {
    total: round1(total),
    max: 110,
    breakdown: components,
    coveragePct: denom > 0 ? round1(contributed / denom) : 0
  };
}

// ---- Top items per category --------------------------------------------

function topByCategory(
  items: PeriodItem[],
  classified: ClassifiedItem[],
  limit = 5
): Record<NutritionCategory, CategoryTopItem[]> {
  const buckets = new Map<NutritionCategory, Map<string, { grams: number; cents: number }>>();
  for (let i = 0; i < classified.length; i += 1) {
    const c = classified[i];
    if (c.quality.severity === "fail") continue;
    // Items without a weight contribute 0 g to every scorer; showing them
    // in top 5 alongside real weighted items would be misleading (e.g. Lady M
    // cake appears as ¥-contributor but 0 g, contradicting UPF/Plate totals).
    if (c.grams === null) continue;
    const name = items[i].name_zh;
    let bucket = buckets.get(c.category);
    if (!bucket) {
      bucket = new Map();
      buckets.set(c.category, bucket);
    }
    const existing = bucket.get(name) ?? { grams: 0, cents: 0 };
    existing.grams += c.grams ?? 0;
    existing.cents += c.cents;
    bucket.set(name, existing);
  }
  const result = {} as Record<NutritionCategory, CategoryTopItem[]>;
  for (const cat of buckets.keys()) {
    const arr = Array.from(buckets.get(cat)!.entries())
      .map(([name, agg]) => ({ name, grams: agg.grams, cents: agg.cents }))
      .sort((a, b) => b.grams - a.grams)
      .slice(0, limit);
    result[cat] = arr;
  }
  // Ensure every category appears even with empty array, so the UI doesn't
  // have to handle missing keys.
  const allCats: NutritionCategory[] = [
    "蔬菜", "水果", "全谷物", "豆类", "坚果", "香料",
    "动物性", "油脂", "含糖饮料", "加工肉", "反式零食", "未分类"
  ];
  for (const cat of allCats) if (!result[cat]) result[cat] = [];
  return result;
}

// ---- Top-level aggregator ----------------------------------------------

export function scorePeriod(
  period: string,
  aliases: ReadonlyArray<ClassifyInput>
): NutritionReport {
  const days = daysInPeriod(period);
  const items = loadItemsForPeriod(period);
  const classified = classifyAll(items, aliases);

  const itemsWithWeight = classified.filter((c) => c.grams !== null).length;
  const coveragePct =
    classified.length > 0 ? itemsWithWeight / classified.length : 0;

  const colorCounts = aggregateColorCounts(classified);
  const skipBreakdown = tallySkips(classified);
  const skippedItems = collectSkippedItems(items, classified);

  return {
    period,
    days,
    itemsAnalyzed: classified.length,
    itemsWithWeight,
    coveragePct: round1(coveragePct),
    skipBreakdown,
    skippedItems,
    topByCategory: topByCategory(items, classified),
    colorCounts,
    plateFilteredGrams: plateFilteredGrams(classified),
    pdi: scorePdi(classified, days),
    plate: scorePlate(classified),
    upf: scoreUpf(classified),
    ahei: scoreAhei(items, classified, days)
  };
}

function collectSkippedItems(
  items: PeriodItem[],
  classified: ClassifiedItem[]
): SkippedItem[] {
  const out: SkippedItem[] = [];
  for (let i = 0; i < classified.length; i += 1) {
    const c = classified[i];
    if (c.quality.severity === "ok") continue;
    out.push({
      itemId: c.id,
      transactionId: c.transactionId,
      receiptId: c.receiptId,
      merchantName: c.merchantName,
      purchasedAt: c.purchasedAt,
      nameZh: c.nameZh,
      category: c.category,
      classificationConfidence: c.classificationConfidence,
      matchedPattern: c.matchedPattern,
      foodAmountValue: c.foodAmountValue,
      foodAmountUnit: c.foodAmountUnit,
      grams: c.grams,
      cents: c.cents,
      itemConfidence: c.itemConfidence,
      reasons: c.quality.reasons,
      severity: c.quality.severity
    });
  }
  return out;
}

function aggregateColorCounts(classified: ClassifiedItem[]): ColorCounts {
  const counts = emptyColorCounts();
  for (const item of classified) {
    if (item.color) counts[item.color] += 1;
  }
  return counts;
}

// ---- helpers ------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
