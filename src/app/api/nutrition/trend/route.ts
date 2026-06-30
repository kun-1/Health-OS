// GET /api/nutrition/trend?months=6
//
// Returns the last N months of total grams for 5 fixed nutrition categories
// (动物性/加工肉/含糖饮料/反式零食/蔬菜). One row per month, one number per
// category — feeds the sparkline row on the nutrition dashboard.
//
// Months are returned oldest → newest so the client can render a left-to-
// right timeline without re-sorting. Months with no purchases in a category
// carry 0 grams (NOT null) so the sparkline stays continuous.
//
// Classification is done in JS (not SQL) so user-set overrides apply — the
// same classifier the score pipeline uses. 100–200 items per month is
// trivial work; no need to fight SQL GROUP BY semantics.

import { NextResponse } from "next/server";

import { rawDb } from "@/lib/db";
import { classify, type ClassifyInput } from "@/lib/nutrition/classify";
import { toGrams } from "@/lib/nutrition/score";
import type { NutritionCategory } from "@/db/schema";

export const dynamic = "force-dynamic";

const TRACKED: ReadonlyArray<NutritionCategory> = [
  "动物性",
  "加工肉",
  "含糖饮料",
  "反式零食",
  "蔬菜"
];

function listMonthRange(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
  }
  return out;
}

function monthBounds(period: string): { start: string; end: string } {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: `${period}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  };
}

function emptyAcc(): Record<NutritionCategory, number> {
  return {
    蔬菜: 0,
    水果: 0,
    全谷物: 0,
    豆类: 0,
    坚果: 0,
    香料: 0,
    动物性: 0,
    油脂: 0,
    含糖饮料: 0,
    加工肉: 0,
    反式零食: 0,
    未分类: 0
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const monthsParam = Number(searchParams.get("months") ?? 6);
  const months =
    Number.isFinite(monthsParam) && monthsParam > 0
      ? Math.min(12, Math.max(1, Math.floor(monthsParam)))
      : 6;

  const periods = listMonthRange(months);
  const aliases = rawDb
    .prepare(
      "SELECT raw_pattern AS rawPattern, category, is_user_set AS isUserSet FROM nutrition_food_aliases"
    )
    .all() as ClassifyInput[];

  const result: Array<{ period: string; grams: Record<NutritionCategory, number> }> = [];
  for (const period of periods) {
    const { start, end } = monthBounds(period);
    const items = rawDb
      .prepare(
        `SELECT ei.name_zh, ei.food_amount_value, ei.food_amount_unit
         FROM expense_items ei
         JOIN expense_transactions et ON et.id = ei.transaction_id
         WHERE et.purchased_at >= ? AND et.purchased_at < ?
           AND ei.category_zh IN ('食物','外食','饮料/咖啡')`
      )
      .all(start, end) as Array<{
        name_zh: string;
        food_amount_value: number | null;
        food_amount_unit: string | null;
      }>;

    const acc = emptyAcc();
    for (const item of items) {
      const { category } = classify(item.name_zh, aliases);
      if (!TRACKED.includes(category)) continue;
      const grams =
        item.food_amount_value !== null
          ? toGrams(item.food_amount_value, item.food_amount_unit)
          : null;
      if (grams === null) continue;
      acc[category] += grams;
    }
    result.push({ period, grams: acc });
  }

  return NextResponse.json({ months: result, tracked: TRACKED });
}