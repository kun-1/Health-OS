"use client";

// Stage 1 nutrition dashboard — supplementary cards: sparkline trend row
// (5 categories × last 6 months) + ring progress (PDI / AHEI).
//
// Kept in a separate file so `nutrition-dashboard.tsx` doesn't grow into
// a 500-line component. All sub-components here are presentation-only;
// data fetching happens in the parent.

import type { NutritionCategory } from "@/db/schema";

function formatGrams(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
  return `${Math.round(g)} g`;
}

function deltaText(prev: number, curr: number): { label: string; cls: string } {
  if (prev === 0 && curr === 0) return { label: "持平", cls: "nut-trend__delta--flat" };
  if (prev === 0) return { label: "新增", cls: "nut-trend__delta--up" };
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 5) return { label: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, cls: "nut-trend__delta--flat" };
  return {
    label: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`,
    cls: pct > 0 ? "nut-trend__delta--up" : "nut-trend__delta--down"
  };
}

type SparklineProps = {
  values: number[];
  // Directional intent: if true, an increasing line is "bad" (animal,
  // processed, sugar, trans); if false, increasing is "good" (vegetables).
  higherIsBad: boolean;
};

function Sparkline({ values, higherIsBad }: SparklineProps) {
  // Empty / single-point: render a flat placeholder dot at the left.
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) {
    return (
      <svg className="nut-trend__svg" viewBox="0 0 100 32" preserveAspectRatio="none">
        <line x1="0" x2="100" y1="16" y2="16" stroke="var(--exp-text-subtle)" strokeDasharray="2 3" strokeWidth="1" />
      </svg>
    );
  }

  const max = Math.max(...values, 1);
  // pad left so single-point shows a dot, not a 100%-long bar
  const w = 100;
  const h = 32;
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = values.length > 1 ? i * stepX : w / 2;
    const y = h - (v / max) * (h - 4) - 2;
    return { x, y };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  // Direction: compare last value vs the value 1 step back
  const dir =
    values.length >= 2 && values[values.length - 1] > values[values.length - 2]
      ? "up"
      : values.length >= 2 && values[values.length - 1] < values[values.length - 2]
        ? "down"
        : "flat";

  // For "higher is bad" categories, an up line should be red. For
  // vegetables, an up line should be green. For flat, neutral.
  const lineCls =
    dir === "flat"
      ? "nut-trend__line"
      : (dir === "up") === higherIsBad
        ? "nut-trend__line nut-trend__line--up"
        : "nut-trend__line nut-trend__line--down";
  const dotCls =
    dir === "flat"
      ? "nut-trend__dot"
      : (dir === "up") === higherIsBad
        ? "nut-trend__dot nut-trend__dot--up"
        : "nut-trend__dot nut-trend__dot--down";

  return (
    <svg className="nut-trend__svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path className={lineCls} d={path} vectorEffect="non-scaling-stroke" />
      {prev ? (
        <line
          x1={last.x}
          x2={prev.x}
          y1={last.y + 0.5}
          y2={prev.y + 0.5}
          stroke="var(--exp-bg)"
          strokeWidth="2"
        />
      ) : null}
      <circle className={dotCls} cx={last.x} cy={last.y} r="2.4" />
    </svg>
  );
}

export type TrendMonth = {
  period: string;
  grams: Record<NutritionCategory, number>;
};

type SparklineRowProps = {
  label: string;
  category: NutritionCategory;
  months: TrendMonth[];
  higherIsBad: boolean;
};

export function SparklineRow({ label, category, months, higherIsBad }: SparklineRowProps) {
  const values = months.map((m) => m.grams[category] ?? 0);
  const curr = values[values.length - 1] ?? 0;
  const prev = values.length >= 2 ? values[values.length - 2] : 0;
  const delta = deltaText(prev, curr);

  return (
    <div className="nut-trend__row">
      <span className="nut-trend__name">{label}</span>
      <Sparkline values={values} higherIsBad={higherIsBad} />
      <span className="nut-trend__meta">
        {formatGrams(curr)}
        <span className={`nut-trend__delta ${delta.cls}`}>{delta.label}</span>
      </span>
    </div>
  );
}

type TrendRowProps = {
  months: TrendMonth[];
  tracked: ReadonlyArray<NutritionCategory>;
};

const TREND_LABELS: Partial<Record<NutritionCategory, string>> = {
  动物性: "动物性",
  加工肉: "加工肉",
  含糖饮料: "含糖饮料",
  精制谷物: "精制谷物",
  甜点: "甜点",
  蔬菜: "蔬菜"
};

const HIGHER_IS_BAD: Partial<Record<NutritionCategory, boolean>> = {
  动物性: true,
  加工肉: true,
  含糖饮料: true,
  精制谷物: true,
  甜点: true,
  蔬菜: false
};

export function TrendSection({ months, tracked }: TrendRowProps) {
  if (months.length === 0) {
    return (
      <div className="nut-trend">
        <div className="nut-trend__title">近 6 月 · 趋势</div>
        <div className="nut-trend__empty">数据不足</div>
      </div>
    );
  }
  return (
    <div className="nut-trend">
      <div className="nut-trend__title">
        近 {months.length} 月 · 趋势 (按采购重量)
        <span className="nut-trend__months">
          {months[0]?.period} → {months[months.length - 1]?.period}
        </span>
      </div>
      {tracked.map((cat) => (
        <SparklineRow
          key={cat}
          label={TREND_LABELS[cat] ?? cat}
          category={cat}
          months={months}
          higherIsBad={HIGHER_IS_BAD[cat] ?? false}
        />
      ))}
    </div>
  );
}

// ---- Ring progress ------------------------------------------------------

type RingProps = {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
};

export function ProgressRing({ value, max, size = 92, stroke = 9 }: RingProps) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  return (
    <div className="nut-ring" style={{ width: size, height: size }}>
      <svg
        className="nut-ring__svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--exp-ring-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--exp-accent)"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={stroke}
          style={{ transition: "stroke-dasharray 600ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="nut-ring__center">
        <span className="nut-ring__value">{Math.round(value)}</span>
        <span className="nut-ring__max">/ {max}</span>
      </div>
    </div>
  );
}
