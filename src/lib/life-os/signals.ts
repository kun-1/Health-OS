import type { ExpenseAnalytics } from "@/lib/expenses/types";
import type { NutritionReport } from "@/lib/nutrition/types";

import { clampScore } from "@/lib/life-os/selectors";

/**
 * Categories the home counts as "food spend". Chinese labels match the
 * `ExpenseCategory` union in src/lib/expenses/types.ts. 外食 = eating out,
 * 饮料咖啡 = drinks/coffee, plus the meal-prep at-home categories.
 */
const FOOD_CATEGORIES: ReadonlySet<string> = new Set([
  "外食",
  "饮料咖啡",
  "食材",
  "零食",
  "水果"
]);

export type FoodSpendRatio = {
  /** Amount in cents spent on food in the current month. */
  foodCents: number;
  /** Total spend (cents) used as the denominator. Falls back to
   *  `effective_spent_this_month` so budget-excluded items don't count
   *  toward the food ratio. */
  totalCents: number;
  /** foodCents / totalCents, in [0, 1]. Null when total is zero. */
  ratio: number | null;
};

export function computeFoodSpendRatio(analytics: ExpenseAnalytics): FoodSpendRatio {
  let foodCents = 0;
  for (const row of analytics.category_breakdown) {
    if (FOOD_CATEGORIES.has(row.category_zh)) {
      foodCents += row.amount;
    }
  }
  // category_breakdown amounts are in cents (consistent with budget_progress.spent);
  // effective_spent_this_month is in yuan, so use the cents denominator to keep
  // the ratio in [0, 1].
  const totalCents = analytics.budget_progress.spent > 0
    ? analytics.budget_progress.spent
    : Math.round(analytics.spent_this_month * 100);
  return {
    foodCents,
    totalCents,
    ratio: totalCents > 0 ? foodCents / totalCents : null
  };
}

/** Today (YYYY-MM-DD) → spend in cents, or 0 if not present. */
export function todaySpendCents(analytics: ExpenseAnalytics, today: string): number {
  const row = analytics.daily_totals.find((d) => d.day === today);
  // ExpenseAnalytics.daily_totals is exposed in yuan for the expense chart,
  // while the Life home KPI formatter expects cents.
  return row ? Math.round(row.amount * 100) : 0;
}

export function pendingReceiptCount(analytics: ExpenseAnalytics): number {
  return analytics.pending_receipts.length;
}

/** Surface-level signals for the Activity card. Keep these to ≤ 3 entries. */
export type Signal = {
  icon: "alert" | "receipt" | "trend";
  title: string;
  meta: string;
};

export function computeSignals(
  report: NutritionReport | null,
  analytics: ExpenseAnalytics,
  prevMonthAnalytics?: ExpenseAnalytics
): Signal[] {
  const signals: Signal[] = [];

  // 1. UPF overrun: monthly UPF share > 30% (plan §3.3 hint).
  if (report && report.upf.upfShare > 0.3) {
    signals.push({
      icon: "alert",
      title: "超加工食品占比偏高",
      meta: `本月 UPF 占比 ${(report.upf.upfShare * 100).toFixed(0)}%，建议回看`
    });
  }

  // 2. Budget overrun (projected or current).
  if (analytics.projected_over_budget || analytics.over_budget_now) {
    const headroom = analytics.projected_over_budget ? "预计月末超额" : "本月已超额";
    signals.push({
      icon: "alert",
      title: headroom,
      meta: `已花 ¥${formatYuanValue(analytics.spent_this_month)} / 预算 ¥${formatYuanValue(analytics.monthly_budget)}`
    });
  }

  // 3. Data gap: longest recent run of days without spending — useful
  // signal because it might just be "forgot to log", not "actually saved".
  const gap = longestZeroDayRun(analytics.daily_totals);
  if (gap >= 4) {
    signals.push({
      icon: "receipt",
      title: `连续 ${gap} 天无支出记录`,
      meta: "数据可能缺失，先补记录再做趋势判断"
    });
  }

  // 4. Spend jump vs previous month (only when both exist).
  if (prevMonthAnalytics && prevMonthAnalytics.effective_spent_this_month > 0) {
    const delta = analytics.effective_spent_this_month - prevMonthAnalytics.effective_spent_this_month;
    const ratio = delta / prevMonthAnalytics.effective_spent_this_month;
    if (Math.abs(ratio) >= 0.25) {
      const dir = ratio > 0 ? "上升" : "下降";
      signals.push({
        icon: "trend",
        title: `本月支出较上月 ${dir} ${(Math.abs(ratio) * 100).toFixed(0)}%`,
        meta: "与上月同期对比，可作交叉参考"
      });
    }
  }

  // 5. Pending receipts need attention.
  if (analytics.pending_receipts.length > 0) {
    signals.push({
      icon: "receipt",
      title: `${analytics.pending_receipts.length} 张票据待确认`,
      meta: "去票据队列处理后可进入预算统计"
    });
  }

  return signals.slice(0, 3);
}

function longestZeroDayRun(daily: { day: string; amount: number }[]): number {
  if (daily.length === 0) return 0;
  // Daily totals come back ascending by day. A 0-amount day followed by
  // more 0-amount days counts as a gap; first non-zero breaks the streak.
  let maxRun = 0;
  let current = 0;
  for (const d of daily) {
    if (d.amount === 0) {
      current += 1;
      if (current > maxRun) maxRun = current;
    } else {
      current = 0;
    }
  }
  return maxRun;
}

/** Cents → yuan, rounded to 2 decimals (no currency symbol). */
export function formatYuan(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Yuan value → formatted string with 2 decimals (no currency symbol). */
export function formatYuanValue(yuan: number): string {
  return yuan.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Active days for the calendar — pulls days with any spending in the
 *  current month from the analytics daily totals. */
export function activeDays(analytics: ExpenseAnalytics): string[] {
  return analytics.daily_totals.filter((d) => d.amount > 0).map((d) => d.day);
}

/* ---------- Phase D: 跨模块洞察 ----------------------------------------
 * The home page surfaces 3 narrative observations rather than a list of
 * raw signals. Wording follows plan §6 ("洞察文案不做因果和医学判断") —
 * we describe what changed, never what caused it or what the user should
 * do medically. */

export type Insight = {
  /** Short headline shown bold in the activity card. */
  title: string;
  /** Secondary line for context / source-of-truth pointer. */
  meta: string;
  /** Tag drives the small leading icon. */
  icon: "trend" | "receipt" | "alert";
};

/** Phase D #1 — compare current month's nutrition score (from the
 *  NutritionReport) against last month's score (derived from trend grams)
 *  to surface the delta. If we can't compare (trend missing, current
 *  unavailable) we degrade to a single-value observation. */
export function nutritionScoreInsight(
  current: NutritionReport | null,
  prevGrams: Record<string, number> | null
): Insight {
  if (!current) {
    return {
      icon: "trend",
      title: "本月营养评分加载中",
      meta: "等待 /api/nutrition/score 响应"
    };
  }
  const currentScore = current && current.pdi.max > 0
    ? deriveScoreFromReport(current)
    : null;

  if (currentScore === null || !prevGrams) {
    return {
      icon: "trend",
      title: `本月营养评分 ${currentScore ?? "—"}`,
      meta: "需要上月数据才能对比变化"
    };
  }

  const prevScore = deriveScoreFromGrams(prevGrams);
  const delta = currentScore - prevScore;
  const direction = delta > 0 ? "上升" : delta < 0 ? "下降" : "持平";
  const sign = delta > 0 ? "+" : "";
  return {
    icon: "trend",
    title: `本月营养评分 ${currentScore}（${direction} ${sign}${delta}）`,
    meta: `上月 ${prevScore} · 基于月度结构评分，仅供参考`
  };
}

/** Phase D #2 — food spend ratio observation. The expense analytics API
 *  only returns the current month's category breakdown, so a true
 *  month-over-month delta isn't possible without a second API call. We
 *  surface the current ratio plus a hint about whether this is high or
 *  low compared to the implicit "balance" expectation. */
export function foodRatioInsight(analytics: ExpenseAnalytics | null): Insight {
  if (!analytics) {
    return {
      icon: "trend",
      title: "食物支出占比加载中",
      meta: "等待 /api/expenses 响应"
    };
  }
  const ratio = computeFoodSpendRatio(analytics);
  if (ratio.ratio === null) {
    return {
      icon: "trend",
      title: "本月还没有支出",
      meta: "上传票据或记一笔后会出现比例"
    };
  }
  const pct = (ratio.ratio * 100).toFixed(0);
  const foodYuan = (ratio.foodCents / 100).toLocaleString("zh-CN", {
    maximumFractionDigits: 0
  });
  return {
    icon: "trend",
    title: `食物支出占比 ${pct}%`,
    meta: `本月食物类 ¥${foodYuan} · 含外食 / 饮料咖啡`
  };
}

/** Phase D #3 — pick the single most actionable data gap. Order of
 *  preference (most-impactful first):
 *   1. pending receipts > 0  → confirm queue
 *   2. coveragePct < 70      → items missing weight
 *   3. skipped due to alias  → ambiguous categorisation
 *   4. longest no-spend run  → possible forgotten logging
 *  Returns null when the data looks healthy and there's nothing to
 *  call out — caller should fall back to a "data looks complete"
 *  observation. */
export function dataGapInsight(
  report: NutritionReport | null,
  analytics: ExpenseAnalytics | null
): Insight {
  if (analytics && analytics.pending_receipts.length > 0) {
    return {
      icon: "receipt",
      title: `${analytics.pending_receipts.length} 张票据待确认`,
      meta: "去票据队列处理后即可进入预算统计"
    };
  }
  if (report && report.coveragePct < 70) {
    return {
      icon: "alert",
      title: `${report.coveragePct.toFixed(0)}% 的食物条目有重量`,
      meta: `${report.itemsAnalyzed - report.itemsWithWeight} 项缺重量信息，补全后趋势更稳`
    };
  }
  if (report && report.skipBreakdown.no_alias_match >= 5) {
    return {
      icon: "alert",
      title: `${report.skipBreakdown.no_alias_match} 项因分类不确定被跳过`,
      meta: "在 /nutrition 给这些条目打别名可纳入后续评分"
    };
  }
  if (analytics) {
    const gap = longestZeroDayRun(analytics.daily_totals);
    if (gap >= 4) {
      return {
        icon: "alert",
        title: `连续 ${gap} 天无支出记录`,
        meta: "可能是忘了记账，回看一下"
      };
    }
  }
  return {
    icon: "trend",
    title: "本月数据看起来完整",
    meta: "如果发现异常，可在 /expenses 手动补充"
  };
}

/* ---------- Local helpers (Phase D only) ------------------------------- */

/** Same formula as the dashboard's structureScore but inlined here to
 *  avoid importing from the dashboard component (which carries a
 *  "use client" boundary). Phase B already moved this into the shared
 *  selectors — we just call it directly here. */
function deriveScoreFromReport(report: NutritionReport): number | null {
  if (report.pdi.max <= 0) return null;
  const pdiPct = (report.pdi.total / report.pdi.max) * 100;
  const aheiPct = report.ahei.max > 0 ? (report.ahei.total / report.ahei.max) * 100 : 0;
  const platePenalty = report.plate.deviation * 18;
  const upfPenalty = report.upf.upfShare * 16;
  return clampScore((pdiPct + aheiPct) / 2 - platePenalty - upfPenalty + 18);
}

/** Trend grams → score. Same formula as the home TrendChart so the
 *  monthly comparison is apples-to-apples. */
function deriveScoreFromGrams(grams: Record<string, number>): number {
  const veg = (grams["蔬菜"] ?? 0) + (grams["水果"] ?? 0);
  const protein = (grams["豆类"] ?? 0) + (grams["坚果"] ?? 0) + (grams["动物性"] ?? 0);
  const whole = grams["全谷物"] ?? 0;
  const bad = (grams["加工肉"] ?? 0) + (grams["含糖饮料"] ?? 0) + (grams["反式零食"] ?? 0);
  const total = Object.values(grams).reduce((s, n) => s + n, 0) || 1;
  return clampScore(
    58 + (veg / total) * 30 + (protein / total) * 12 + (whole / total) * 14 - (bad / total) * 24
  );
}

/** Public helper: pull the previous-month grams out of the trend payload
 *  (trend comes back oldest → newest). Caller passes the trend array and
 *  the current month; we return the second-to-last row's grams or null. */
export function prevMonthGrams(
  trend: ReadonlyArray<{ period: string; grams: Record<string, number> }>,
  currentMonth: string
): Record<string, number> | null {
  if (trend.length < 2) return null;
  const lastIdx = trend.findIndex((r) => r.period === currentMonth);
  if (lastIdx < 1) return null;
  return trend[lastIdx - 1]?.grams ?? null;
}

/** Bundle the three Phase D insights for direct consumption by the
 *  Activity card. Order matches plan §6. */
export function computePhaseDInsights(
  report: NutritionReport | null,
  analytics: ExpenseAnalytics | null,
  trend: ReadonlyArray<{ period: string; grams: Record<string, number> }>,
  currentMonth: string
): Insight[] {
  return [
    nutritionScoreInsight(report, prevMonthGrams(trend, currentMonth)),
    foodRatioInsight(analytics),
    dataGapInsight(report, analytics)
  ];
}
