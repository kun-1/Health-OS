// Stage 1 nutrition scoring: substring classifier that maps Chinese food
// names to plant / animal / ultra-processed buckets. Inputs are seeded
// aliases in `nutrition_food_aliases`; outputs are CategoryResult.
//
// The classifier does ONE thing: longest-substring match. It does NOT know
// about calories, USDA, or cooking loss — those are stage 2.

import type { NutritionCategory } from "@/db/schema";
import type { CategoryResult } from "@/lib/nutrition/types";

// Brand prefixes that frequently precede a real food name in Chinese
// supermarket receipts. Stripped before matching so "盒马 苹果" matches the
// "苹果" alias instead of falling through to "未分类".
const BRAND_PREFIX_RE =
  /^(盒马|有机|精选|原野|每日|田园|清润|好货|优质|冷鲜|冰鲜|冷冻|鲜活|散养|泰森|海底捞)/;

// Noise characters stripped before matching: digits, units, brackets, single
// letters. Receipts embed size info ("200g", "596ml*12瓶") that we don't want
// to match against aliases.
const NOISE_RE = /[\d()（）【】\[\]gG]/g;

function normalize(name: string): string {
  let s = name.replace(NOISE_RE, " ").replace(/\s+/g, " ").trim();
  s = s.replace(BRAND_PREFIX_RE, "");
  return s;
}

// Caller-supplied alias shape. Loosely typed so the API layer can pass in
// `number | boolean` isUserSet values without forcing it to coerce at the
// boundary — better-sqlite3 returns INTEGER (0/1), the public API hands
// back boolean via JSON.
export type ClassifyInput = {
  rawPattern: string;
  category: NutritionCategory;
  isUserSet: boolean | number;
};

export function classify(
  nameZh: string,
  aliases: ReadonlyArray<ClassifyInput>
): CategoryResult {
  const haystack = normalize(nameZh);
  if (!haystack) {
    return { category: "未分类", confidence: 0, matchedPattern: null };
  }

  let bestPattern: string | null = null;
  let bestCategory: NutritionCategory | null = null;
  let bestUser = false;
  let bestLen = 0;

  for (const alias of aliases) {
    if (!haystack.includes(alias.rawPattern)) continue;
    const len = alias.rawPattern.length;
    const isUser = !!alias.isUserSet;
    // Two-tier precedence: longer patterns win; ties go to user-set rows.
    const better =
      len > bestLen || (len === bestLen && isUser && !bestUser);
    if (better) {
      bestPattern = alias.rawPattern;
      bestCategory = alias.category;
      bestUser = isUser;
      bestLen = len;
    }
  }

  if (!bestPattern || !bestCategory) {
    return { category: "未分类", confidence: 0, matchedPattern: null };
  }

  // Confidence grows with pattern length (a 2-char pattern is fuzzy; 8+ chars
  // is specific). Capped at 1.0; user-set rows get a small bonus.
  const lengthScore = Math.min(1, bestLen / 8);
  const userBonus = bestUser ? 0.1 : 0;
  return {
    category: bestCategory,
    confidence: Math.min(1, lengthScore + userBonus),
    matchedPattern: bestPattern
  };
}