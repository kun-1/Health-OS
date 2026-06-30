"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { clampScore } from "@/lib/life-os/selectors";

import "./life-os.css";

type TrendRow = {
  period: string;
  grams: Record<string, number>;
};

type Props = {
  trend: ReadonlyArray<TrendRow>;
  /** Spend per period (YYYY-MM) in cents. Only the periods passed in
   *  will render bars; the rest of the chart line still draws. */
  spendByPeriod: Readonly<Record<string, number>>;
};

type ChartPoint = {
  label: string;
  period: string;
  score: number | null;
  spend: number;
};

/** Score formula duplicated from nutrition-dashboard's `makeTrendRows`.
 *  Phase B will replace this with a shared selector under
 *  src/lib/nutrition/selectors.ts so /nutrition and / agree on the
 *  historic-trend value. */
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

function monthLabel(period: string): string {
  // "2026-01" → "1月"
  const m = period.split("-")[1];
  return m ? `${parseInt(m, 10)}月` : period;
}

function yuan(v: number): string {
  return `¥${(v / 100).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

const AXIS_TICK = { fontSize: 12, fill: "#50585E", fontFamily: "var(--life-font-num)" };
const GRID_STROKE = "rgba(15, 23, 42, 0.06)";
const LINE_COLOR = "#1a4d22";
const LINE_FILL = "rgba(155, 234, 61, 0.18)";
const BAR_COLOR = "#F94310";

export function TrendChart({ trend, spendByPeriod }: Props) {
  const data: ChartPoint[] = trend.map((row) => ({
    period: row.period,
    label: monthLabel(row.period),
    score: deriveScoreFromGrams(row.grams),
    spend: spendByPeriod[row.period] ?? 0
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="score"
          domain={[0, 100]}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <YAxis
          yAxisId="spend"
          orientation="right"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          tickFormatter={yuan}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
          contentStyle={{
            borderRadius: 10,
            border: "none",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
            fontFamily: "var(--life-font)"
          }}
          formatter={(value, key) => {
            if (key === "spend" && typeof value === "number") return yuan(value);
            return typeof value === "number" ? value : String(value ?? "");
          }}
          labelStyle={{ color: "#101512", fontWeight: 700 }}
        />
        <Bar
          yAxisId="spend"
          dataKey="spend"
          fill={BAR_COLOR}
          radius={[6, 6, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
        <Line
          yAxisId="score"
          type="monotone"
          dataKey="score"
          stroke={LINE_COLOR}
          strokeWidth={2.5}
          dot={{ r: 4, strokeWidth: 2, fill: "#ffffff" }}
          activeDot={{ r: 6 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Filled area variant — currently unused, exported in case Phase D wants
 *  to swap the line for a soft area without rewriting the data shape. */
export function _unused_fill_color(): string {
  return LINE_FILL;
}