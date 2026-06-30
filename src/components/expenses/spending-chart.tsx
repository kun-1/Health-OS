"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatMoney } from "@/lib/expenses/money";
import type { ExpenseTransaction } from "@/lib/expenses/types";

type DailyTotal = { day: string; amount: number };

type Props = {
  dailyTotals: DailyTotal[];
  prevMonthTotals: DailyTotal[];
  month: string; // "YYYY-MM"
  monthlyBudget: number; // yuan
  currency: string; // for formatting
  // Optional: when present, the "全部" tab can fall back to it for a longer
  // view. Currently the spec marks "全部" as TODO, so this is unused — kept
  // for future wiring.
  recentTransactions?: ExpenseTransaction[];
};

type ViewMode = "week" | "month";

const SVG_WIDTH = 600;
const SVG_HEIGHT = 120;
const PADDING_X = 8;
const PADDING_Y = 8;

function daysInMonth(month: string): number {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

function shiftMonthLocal(month: string, delta: number): string {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return month;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dayKeyForIndex(month: string, dayIndex: number): string {
  const [yStr, mStr] = month.split("-");
  return `${yStr}-${mStr}-${String(dayIndex).padStart(2, "0")}`;
}

// Build a cumulative series for the supplied month, indexed 0..N-1 where
// index `i` corresponds to day `i+1`. Days with no spending in `totals` stay
// at their running cumulative from the previous day.
function buildSeries(totals: DailyTotal[], month: string, N: number): number[] {
  const daily = new Map<string, number>();
  for (const entry of totals) {
    daily.set(entry.day, (daily.get(entry.day) ?? 0) + entry.amount);
  }
  const sortedEntries = Array.from(daily.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const cumByKey = new Map<string, number>();
  let acc = 0;
  for (const [day, amount] of sortedEntries) {
    acc += amount;
    cumByKey.set(day, acc);
  }
  const series: number[] = new Array(N).fill(0);
  for (let i = 0; i < N; i += 1) {
    const key = dayKeyForIndex(month, i + 1);
    series[i] = cumByKey.get(key) ?? 0;
  }
  return series;
}

function totalOf(totals: DailyTotal[]): number {
  return totals.reduce((sum, entry) => sum + entry.amount, 0);
}

function buildPolyline(series: number[], maxY: number, startDay: number, endDay: number): string {
  const N = series.length;
  if (N === 0) return "";
  const drawable = Math.max(1, N - 1);
  const chartWidth = SVG_WIDTH - 2 * PADDING_X;
  const chartHeight = SVG_HEIGHT - 2 * PADDING_Y;
  const points: string[] = [];
  for (let i = startDay; i <= endDay; i += 1) {
    const x = PADDING_X + ((i - startDay) / drawable) * chartWidth;
    const value = series[i] ?? 0;
    const y = SVG_HEIGHT - PADDING_Y - (value / maxY) * chartHeight;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  if (points.length === 1) {
    // Single-day polyline: extend it horizontally so the stroke is visible.
    const only = points[0]!;
    const [xStr, yStr] = only.split(",");
    points.push(`${(Number(xStr) + 1).toFixed(2)},${yStr}`);
  }
  return points.join(" ");
}

export function SpendingChart({ dailyTotals, prevMonthTotals, month, monthlyBudget, currency }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [drawKey, setDrawKey] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const currentPathRef = useRef<SVGPolylineElement | null>(null);
  const previousPathRef = useRef<SVGPolylineElement | null>(null);
  const [currentPathLen, setCurrentPathLen] = useState(0);
  const [previousPathLen, setPreviousPathLen] = useState(0);

  const N = daysInMonth(month);
  const prevMonth = shiftMonthLocal(month, -1);

  // Series. prevSeries is aligned day-of-month to the current month; missing
  // days in the previous month (e.g. Feb 29) just stay 0, so the dashed line
  // still tracks the same x-axis grid.
  const currentSeries = useMemo(() => buildSeries(dailyTotals, month, N), [dailyTotals, month, N]);
  const previousSeries = useMemo(() => buildSeries(prevMonthTotals, prevMonth, N), [prevMonthTotals, prevMonth, N]);

  const currentTotal = totalOf(dailyTotals);
  const previousTotal = totalOf(prevMonthTotals);
  const delta = currentTotal - previousTotal;

  // Re-trigger the draw animation on tab change.
  useEffect(() => {
    setDrawKey((k) => k + 1);
  }, [viewMode, month]);

  // Recompute path lengths so the CSS variable can drive stroke-dasharray.
  useEffect(() => {
    const currentLen = currentPathRef.current?.getTotalLength() ?? 0;
    const previousLen = previousPathRef.current?.getTotalLength() ?? 0;
    setCurrentPathLen(currentLen);
    setPreviousPathLen(previousLen);
  }, [currentSeries, previousSeries, viewMode]);

  // Tab domains. "week" slices the last 7 days (capped at N-1..N). "month"
  // uses the full 1..N.
  let startDay = 0;
  const endDay = N - 1;
  if (viewMode === "week") {
    startDay = Math.max(0, N - 7);
  }

  const currentMax = Math.max(...currentSeries, 0);
  const previousMax = Math.max(...previousSeries, 0);
  const budgetCap = monthlyBudget > 0 ? monthlyBudget : 0;
  const maxY = Math.max(currentMax, previousMax, budgetCap) * 1.1 || 1;

  const currentPath = buildPolyline(currentSeries, maxY, startDay, endDay);
  const previousPath = buildPolyline(previousSeries, maxY, startDay, endDay);

  // Tooltip x is the *fraction* of the chart's CSS width the cursor is over.
  // Stored in state so the tooltip stays anchored to the same fractional
  // position even if the card resizes between the last mousemove and the
  // next render (e.g. window resize, font swap).
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);

  function onMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    // Use the SVG's bounding rect (not the wrapper's) so the fraction maps
    // to the actual chart surface. The wrapper can include padding or
    // surrounding chrome; the SVG itself is the visible chart.
    const target = svgRef.current ?? wrapRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    if (fraction < 0 || fraction > 1) {
      setHoverIndex(null);
      setHoverFraction(null);
      return;
    }
    setHoverFraction(fraction);
    // Map the fractional cursor position back to a day index. Using the
    // current view window (startDay..endDay) keeps the last-7-days "周" tab
    // and the full-month "月" tab both responsive across the visible range.
    const window = Math.max(1, endDay - startDay);
    const dayIndex = Math.round(fraction * window) + startDay;
    const clamped = Math.min(N - 1, Math.max(0, dayIndex));
    setHoverIndex(clamped);
  }

  function onMouseLeave() {
    setHoverIndex(null);
    setHoverFraction(null);
  }

  // Tooltip data for the hovered day. We compare the running cumulative at
  // day `i+1` for both months so the user can see "spent by this point in
  // the month" vs the same day-of-month in the previous month.
  const hoverData = hoverIndex !== null
    ? {
        day: hoverIndex + 1,
        currentCum: currentSeries[hoverIndex] ?? 0,
        previousCum: previousSeries[hoverIndex] ?? 0
      }
    : null;

  // Delta label.
  let deltaClass = "exp-chart-card__delta exp-chart-card__delta--flat";
  let deltaText = "持平";
  if (currentTotal === 0 && previousTotal === 0) {
    deltaText = "持平";
  } else if (delta > 0) {
    deltaClass = "exp-chart-card__delta exp-chart-card__delta--up";
    deltaText = `较上月 ↑${formatMoney(delta, currency)}`;
  } else if (delta < 0) {
    deltaClass = "exp-chart-card__delta exp-chart-card__delta--down";
    deltaText = `较上月 ↓${formatMoney(Math.abs(delta), currency)}`;
  }

  // Budget line: only show when budget fits inside the chart.
  const showBudgetLine = budgetCap > 0 && budgetCap <= maxY;
  const budgetY =
    SVG_HEIGHT - PADDING_Y - (budgetCap / maxY) * (SVG_HEIGHT - 2 * PADDING_Y);

  // Hairline x for the hovered day.
  const hoverX = (() => {
    if (hoverIndex === null) return null;
    const drawable = Math.max(1, N - 1);
    const chartWidth = SVG_WIDTH - 2 * PADDING_X;
    return PADDING_X + (hoverIndex / drawable) * chartWidth;
  })();

  // Inline CSS variables drive the stroke-dasharray animation. The
  // `as React.CSSProperties` cast is required because TS doesn't know about
  // custom properties on the style prop.
  const currentLineStyle = {
    ["--exp-chart-len" as string]: `${currentPathLen}`
  } as React.CSSProperties;
  const previousLineStyle = {
    ["--exp-chart-len" as string]: `${previousPathLen}`
  } as React.CSSProperties;

  return (
    <div className="exp-chart-card">
      <div className="exp-chart-card__head">
        <div>
          <h3 className="exp-chart-card__title">本月消费</h3>
          <div className={deltaClass}>{deltaText}</div>
        </div>
        <div className="exp-chart-card__total">{formatMoney(currentTotal, currency)}</div>
      </div>
      <div
        className="exp-chart-svg-wrap"
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
        ref={wrapRef}
      >
        <svg
          aria-label="本月累计消费曲线"
          className="exp-chart-svg"
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          {showBudgetLine ? (
            <line
              opacity="0.4"
              stroke="var(--exp-warn)"
              strokeDasharray="3 3"
              strokeWidth="1"
              x1={PADDING_X}
              x2={SVG_WIDTH - PADDING_X}
              y1={budgetY}
              y2={budgetY}
            />
          ) : null}
          {hoverX !== null ? (
            <line
              stroke="var(--exp-border-strong)"
              x1={hoverX}
              x2={hoverX}
              y1={PADDING_Y}
              y2={SVG_HEIGHT - PADDING_Y}
            />
          ) : null}
          <polyline
            className="exp-chart-line"
            fill="none"
            key={`prev-${drawKey}`}
            opacity="0.7"
            points={previousPath}
            ref={previousPathRef}
            stroke="var(--exp-text-subtle)"
            strokeDasharray="4 3"
            strokeWidth="1.5"
            style={previousLineStyle}
          />
          <polyline
            className="exp-chart-line"
            fill="none"
            key={`cur-${drawKey}`}
            points={currentPath}
            ref={currentPathRef}
            stroke="var(--exp-accent)"
            strokeWidth="2"
            style={currentLineStyle}
          />
        </svg>
        {hoverData && hoverFraction !== null ? (
          // Anchor the tooltip to the cursor's fractional position. Using
          // % + clamp(…) keeps the tooltip inside the chart on mobile,
          // where the SVG and its wrapper can be any width.
          <div
            className="exp-chart-tooltip"
            style={{
              left: `clamp(0px, calc(${hoverFraction * 100}% - 60px), calc(100% - 120px))`,
              top: 0
            }}
          >
            <div className="exp-chart-tooltip__date">{hoverData.day}日</div>
            <div className="exp-chart-tooltip__row">
              本月累计 <strong>{formatMoney(hoverData.currentCum, currency)}</strong>
            </div>
            <div className="exp-chart-tooltip__row">
              上月同期 <strong>{formatMoney(hoverData.previousCum, currency)}</strong>
            </div>
          </div>
        ) : null}
      </div>
      <div className="exp-chart-tabs" role="tablist">
        {(["week", "month"] as ViewMode[]).map((mode) => (
          <button
            aria-selected={viewMode === mode}
            className={`exp-chart-tab ${viewMode === mode ? "exp-chart-tab--active" : ""}`}
            key={mode}
            onClick={() => setViewMode(mode)}
            role="tab"
            type="button"
          >
            {mode === "week" ? "周" : "月"}
          </button>
        ))}
      </div>
    </div>
  );
}
