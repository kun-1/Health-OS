import type { ExpenseAnalytics } from "@/lib/expenses/types";
import type { NutritionReport } from "@/lib/nutrition/types";

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
  const totalCents = analytics.effective_spent_this_month > 0
    ? analytics.effective_spent_this_month
    : analytics.spent_this_month;
  return {
    foodCents,
    totalCents,
    ratio: totalCents > 0 ? foodCents / totalCents : null
  };
}

/** Today (YYYY-MM-DD) → spend in cents, or 0 if not present. */
export function todaySpendCents(analytics: ExpenseAnalytics, today: string): number {
  const row = analytics.daily_totals.find((d) => d.day === today);
  return row?.amount ?? 0;
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
      meta: `已花 ¥${formatYuan(analytics.spent_this_month)} / 预算 ¥${formatYuan(analytics.monthly_budget)}`
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

/** Active days for the calendar — pulls days with any spending in the
 *  current month from the analytics daily totals. */
export function activeDays(analytics: ExpenseAnalytics): string[] {
  return analytics.daily_totals.filter((d) => d.amount > 0).map((d) => d.day);
}