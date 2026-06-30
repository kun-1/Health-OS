"use client";

import { ArrowUpRight, CircleDollarSign, Clock3, Database, Salad, TrendingUp } from "lucide-react";

import { ActivityCard } from "./activity-card";
import { CalendarCard } from "./calendar-card";
import { ChartCard } from "./chart-card";
import { LifeShell } from "./life-shell";
import { MetricCard } from "./metric-card";
import { NutritionBreakdown } from "./nutrition-breakdown";
import { RecentTransactions } from "./recent-transactions";
import { TrendChart } from "./trend-chart";
import { useHomeData } from "./use-home-data";
import "./life-os.css";

import {
  activeDays,
  computeFoodSpendRatio,
  computePhaseDInsights,
  formatYuan,
  todaySpendCents
} from "@/lib/life-os/signals";

function yuan(cents: number): string {
  return `¥${formatYuan(cents)}`;
}

/**
 * Phase A2 home: shell + 4 live KPIs + main trend chart + recent
 * transactions + nutrition breakdown + calendar + activity signals.
 *
 * Each KPI / chart card owns its own loading/error state via the shared
 * `useHomeData` hook. A failure on one source does NOT take down the
 * whole page — the others continue to render whatever data they have.
 */
export function LifeHome() {
  const { month, today, score, trend, analytics } = useHomeData();

  const scoreState = score.kind === "ok" ? score.data : null;
  const analyticsState = analytics.kind === "ok" ? analytics.data : null;
  const trendState = trend.kind === "ok" ? trend.data : null;

  // Derived values (only when source is ready).
  const foodRatio =
    analyticsState != null ? computeFoodSpendRatio(analyticsState) : null;
  const todaySpend =
    analyticsState != null ? todaySpendCents(analyticsState, today) : 0;

  // Trend chart needs spend totals for the rightmost 1–2 months. The
  // expense analytics payload already includes prev month daily totals,
  // so we can fold them in without an extra request.
  const spendByPeriod: Record<string, number> = {};
  if (analyticsState) {
    spendByPeriod[month] = analyticsState.effective_spent_this_month;
    const prevMonth = prevMonthOf(month);
    if (prevMonth) {
      const sum = analyticsState.prev_month_daily_totals.reduce(
        (acc, row) => acc + row.amount,
        0
      );
      if (sum > 0) spendByPeriod[prevMonth] = sum;
    }
  }

  // Phase D insights: three narrative observations (nutrition delta /
  // food ratio / data gap). Computed lazily so a single API failure
  // doesn't blank out the whole list.
  const insights = computePhaseDInsights(
    scoreState?.report ?? null,
    analyticsState,
    trendState ?? [],
    month
  );

  return (
    <LifeShell>
      <div className="life-home">
        <div className="life-home__primary">
          {/* Row 1 — KPI cards */}
          <section className="life-home__kpis" aria-label="关键指标">
            <MetricCard
              title="营养评分"
              state={score.kind === "loading" ? "loading" : score.kind === "error" ? "error" : "ok"}
              errorMessage={score.kind === "error" ? score.message : undefined}
              value={scoreState ? Math.round(scoreState.score) : "—"}
              delta={
                scoreState
                  ? <>本月 · 覆盖 {scoreState.report.coveragePct.toFixed(0)}%</>
                  : undefined
              }
              footnote="基于月度购买 / 票据数据反映饮食结构倾向，不等于每日摄入"
              icon={<Salad strokeWidth={2} />}
              variant="highlight"
              href="/nutrition"
            />
            <MetricCard
              title="今日支出"
              state={analytics.kind === "loading" ? "loading" : analytics.kind === "error" ? "error" : "ok"}
              errorMessage={analytics.kind === "error" ? analytics.message : undefined}
              value={yuan(todaySpend)}
              delta={
                analyticsState
                  ? <>本月 {yuan(analyticsState.spent_this_month)}</>
                  : undefined
              }
              footnote={
                analyticsState
                  ? `预算 ${yuan(analyticsState.monthly_budget)} · ${analyticsState.budget_progress_label ?? "进度待算"}`
                  : undefined
              }
              icon={<CircleDollarSign strokeWidth={2} />}
              href="/expenses"
            />
            <MetricCard
              title="食物支出占比"
              state={analytics.kind === "loading" ? "loading" : analytics.kind === "error" ? "error" : "ok"}
              errorMessage={analytics.kind === "error" ? analytics.message : undefined}
              value={
                foodRatio && foodRatio.ratio !== null
                  ? `${(foodRatio.ratio * 100).toFixed(0)}%`
                  : "—"
              }
              delta={
                foodRatio && foodRatio.ratio !== null
                  ? <>食物 {yuan(foodRatio.foodCents)} · 全部 {yuan(foodRatio.totalCents)}</>
                  : undefined
              }
              footnote="食物 + 外食 + 饮料咖啡 ÷ 总支出"
              icon={<TrendingUp strokeWidth={2} />}
            />
            <MetricCard
              title="记录完整度"
              state={score.kind === "loading" ? "loading" : score.kind === "error" ? "error" : "ok"}
              errorMessage={score.kind === "error" ? score.message : undefined}
              value={scoreState ? `${scoreState.report.coveragePct.toFixed(0)}%` : "—"}
              delta={
                scoreState
                  ? <>{scoreState.report.itemsWithWeight} / {scoreState.report.itemsAnalyzed} 项有重量</>
                  : undefined
              }
              footnote={
                analyticsState && analyticsState.pending_receipts.length > 0
                  ? `另有 ${analyticsState.pending_receipts.length} 张票据待确认`
                  : "有重量条目 ÷ 总食物条目"
              }
              icon={<Database strokeWidth={2} />}
              href="/nutrition"
            />
          </section>

          {/* Row 2 — main trend chart */}
          <ChartCard
            title="营养评分 · 支出趋势"
            subtitle="近 6 个月"
            toolbar={
              <span className="life-topbar__chip" aria-hidden>
                <Clock3 strokeWidth={2} style={{ width: 14, height: 14 }} />
                实时
              </span>
            }
            footer={
              trendState && trendState.length > 0
                ? "营养评分按月度分类克数推算；柱状仅显示已闭合月份支出。"
                : "趋势数据加载中…"
            }
          >
            {trend.kind === "loading" || analytics.kind === "loading" ? (
              <div className="life-chart-placeholder" style={{ minHeight: 280 }}>
                趋势图加载中…
              </div>
            ) : trend.kind === "error" ? (
              <div className="life-chart-placeholder" style={{ minHeight: 280, color: "#a0aaa3" }}>
                趋势数据加载失败：{trend.message}
              </div>
            ) : trendState && trendState.length > 0 ? (
              <TrendChart trend={trendState} spendByPeriod={spendByPeriod} />
            ) : (
              <div className="life-chart-placeholder" style={{ minHeight: 280 }}>
                近 6 个月没有足够数据画趋势
              </div>
            )}
          </ChartCard>

          {/* Row 3 — two cards: recent transactions + nutrition breakdown */}
          <section className="life-home__bottom" aria-label="详情卡片">
            {analyticsState ? (
              <RecentTransactions
                transactions={analyticsState.recent_transactions}
                currency={analyticsState.primary_currency}
              />
            ) : analytics.kind === "loading" ? (
              <RecentTransactions transactions={[]} currency="—" />
            ) : (
              <section className="life-card">
                <header className="life-card__header">
                  <span className="life-card__title">最近交易</span>
                </header>
                <div className="life-chart-placeholder" style={{ minHeight: 160, color: "#a0aaa3" }}>
                  交易数据加载失败：{analytics.kind === "error" ? analytics.message : ""}
                </div>
              </section>
            )}
            {scoreState ? (
              <NutritionBreakdown report={scoreState.report} />
            ) : score.kind === "loading" ? (
              <section className="life-card">
                <header className="life-card__header">
                  <span className="life-card__title">营养结构 · 四维</span>
                </header>
                <div className="life-chart-placeholder" style={{ minHeight: 160 }}>
                  四维评分加载中…
                </div>
              </section>
            ) : (
              <section className="life-card">
                <header className="life-card__header">
                  <span className="life-card__title">营养结构 · 四维</span>
                </header>
                <div className="life-chart-placeholder" style={{ minHeight: 160, color: "#a0aaa3" }}>
                  营养数据加载失败：{score.kind === "error" ? score.message : ""}
                </div>
              </section>
            )}
          </section>
        </div>

        <aside className="life-home__aside" aria-label="侧栏">
          <CalendarCard activeDays={analyticsState ? activeDays(analyticsState) : []} />
          <ActivityCard entries={insights} />
        </aside>
      </div>
    </LifeShell>
  );
}

/** Compute the YYYY-MM that comes immediately before `current`. */
function prevMonthOf(current: string): string | null {
  const [y, m] = current.split("-").map((n) => parseInt(n, 10));
  if (!y || !m) return null;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

// ArrowUpRight is referenced via the lucide import above so tree-shaking
// keeps it available to A2 follow-ups (e.g. an external-link affordance).
const _unused = ArrowUpRight;
void _unused;