"use client";

import { CheckCircle2, CircleDollarSign, Clock3, Database, Salad } from "lucide-react";

import { ActivityCard } from "./activity-card";
import { CalendarCard } from "./calendar-card";
import { ChartCard } from "./chart-card";
import { LifeShell } from "./life-shell";
import { MetricCard } from "./metric-card";
import { NutritionMiniBars } from "./nutrition-mini-bars";
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

function yuanValue(value: number): string {
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CircularProgress({ pct, size, stroke }: { pct: number; size: number; stroke: number }) {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg
      className="life-circular-progress"
      height={size}
      role="img"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke="var(--life-card-soft)"
        strokeWidth={stroke}
      />
      <circle
        className="life-circular-progress__bar"
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke="var(--life-green-strong)"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        strokeWidth={stroke}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
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
    // budget_progress.spent is cents; effective_spent_this_month is yuan.
    spendByPeriod[month] = analyticsState.budget_progress.spent;
    const prevMonth = prevMonthOf(month);
    if (prevMonth) {
      const sum = analyticsState.prev_month_daily_totals.reduce(
        (acc, row) => acc + Math.round(row.amount * 100),
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
              href={`/nutrition?month=${encodeURIComponent(month)}`}
            >
              {scoreState ? <NutritionMiniBars report={scoreState.report} /> : null}
            </MetricCard>
            <MetricCard
              title="今日支出"
              state={analytics.kind === "loading" ? "loading" : analytics.kind === "error" ? "error" : "ok"}
              errorMessage={analytics.kind === "error" ? analytics.message : undefined}
              value={yuan(todaySpend)}
              delta={
                analyticsState
                  ? <>本月 {yuanValue(analyticsState.spent_this_month)}</>
                  : undefined
              }
              footnote={
                analyticsState
                  ? `预算 ${yuanValue(analyticsState.monthly_budget)} · ${analyticsState.budget_progress_label ?? "进度待算"}${foodRatio && foodRatio.ratio !== null ? ` · 本月食物已花 ${yuan(foodRatio.foodCents)}` : ""}`
                  : undefined
              }
              icon={<CircleDollarSign strokeWidth={2} />}
              href={`/expenses/analytics?month=${encodeURIComponent(month)}`}
            />
            <MetricCard
              title="习惯 / 任务完成度"
              state="ok"
              value="0%"
              delta={<>今日 0 / 0 项已完成</>}
              footnote="健康习惯追踪即将上线"
              icon={<CheckCircle2 strokeWidth={2} />}
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
              href={`/nutrition?month=${encodeURIComponent(month)}`}
              decorator={
                scoreState ? (
                  <CircularProgress
                    pct={Math.round(scoreState.report.coveragePct)}
                    size={52}
                    stroke={5}
                  />
                ) : null
              }
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
              <div className="life-chart-placeholder" style={{ minHeight: 280, color: "var(--life-subtle)" }}>
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

        </div>

        <aside className="life-home__aside" aria-label="侧栏">
          <CalendarCard activeDays={analyticsState ? activeDays(analyticsState) : []} />
          <ActivityCard entries={insights} />
          {analyticsState ? (
            <RecentTransactions
              currency={analyticsState.primary_currency}
              transactions={analyticsState.recent_transactions}
            />
          ) : analytics.kind === "loading" ? (
            <RecentTransactions currency="—" transactions={[]} />
          ) : (
            <section className="life-card">
              <header className="life-card__header">
                <span className="life-card__title">最近交易</span>
              </header>
              <div className="life-chart-placeholder" style={{ minHeight: 160, color: "var(--life-subtle)" }}>
                交易数据加载失败：{analytics.kind === "error" ? analytics.message : ""}
              </div>
            </section>
          )}
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
