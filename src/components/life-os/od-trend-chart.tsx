"use client";

import { useMemo } from "react";

import "./od-home.css";

type Range = "1m" | "3m" | "6m";

type Series = {
  key: "nutrition" | "spending" | "sleep" | "health";
  color: string;
  data: number[];
};

const SERIES_PRESETS: Record<Range, { months: string[]; series: Series[] }> = {
  "1m": {
    months: ["第1周", "第2周", "第3周", "第4周"],
    series: [
      { key: "nutrition", color: "var(--od-nutrition-green)", data: [76, 79, 80, 82] },
      { key: "spending",  color: "var(--od-spending-amber)",  data: [55, 50, 48, 48] },
      { key: "sleep",     color: "var(--od-sleep-blue)",      data: [72, 74, 75, 76] },
      { key: "health",    color: "var(--od-health-green)",    data: [68, 70, 73, 75] }
    ]
  },
  "3m": {
    months: ["5月", "6月", "7月"],
    series: [
      { key: "nutrition", color: "var(--od-nutrition-green)", data: [80, 78, 82] },
      { key: "spending",  color: "var(--od-spending-amber)",  data: [60, 52, 48] },
      { key: "sleep",     color: "var(--od-sleep-blue)",      data: [71, 74, 76] },
      { key: "health",    color: "var(--od-health-green)",    data: [68, 72, 75] }
    ]
  },
  "6m": {
    months: ["2月", "3月", "4月", "5月", "6月", "7月"],
    series: [
      { key: "nutrition", color: "var(--od-nutrition-green)", data: [70, 75, 72, 80, 78, 82] },
      { key: "spending",  color: "var(--od-spending-amber)",  data: [62, 58, 55, 60, 52, 48] },
      { key: "sleep",     color: "var(--od-sleep-blue)",      data: [68, 70, 72, 71, 74, 76] },
      { key: "health",    color: "var(--od-health-green)",    data: [55, 60, 65, 68, 72, 75] }
    ]
  }
};

const LEGEND: { key: Series["key"]; label: string; color: string }[] = [
  { key: "nutrition", label: "营养", color: "var(--od-nutrition-green)" },
  { key: "spending",  label: "支出", color: "var(--od-spending-amber)" },
  { key: "sleep",     label: "睡眠", color: "var(--od-sleep-blue)" },
  { key: "health",    label: "习惯", color: "var(--od-health-green)" }
];

const W = 600;
const H = 160;
const PAD = 24;

type Props = {
  range: Range;
  onChangeRange: (next: Range) => void;
};

export function ODTrendChart({ range, onChangeRange }: Props) {
  const preset = SERIES_PRESETS[range];

  const paths = useMemo(() => {
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;
    return preset.series.map((s) => {
      const points = s.data.map((v, i) => {
        const x = PAD + (innerW / (s.data.length - 1)) * i;
        const y = PAD + innerH - (v / 100) * innerH;
        return { x, y };
      });
      const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      return { key: s.key, color: s.color, d, points };
    });
  }, [preset]);

  return (
    <div className="od-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="趋势图">
        {[0, 1, 2, 3, 4].map((i) => {
          const y = PAD + ((H - PAD * 2) / 4) * i;
          return (
            <line
              key={i}
              x1={PAD}
              y1={y}
              x2={W - PAD}
              y2={y}
              stroke="var(--od-border)"
              strokeWidth={1}
            />
          );
        })}
        {paths.map((p) => (
          <g key={p.key}>
            <path d={p.d} fill="none" stroke={p.color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
            {p.points.map((pt, idx) => (
              <circle key={idx} cx={pt.x} cy={pt.y} r={2.5} fill={p.color} />
            ))}
          </g>
        ))}
        {preset.months.map((m, i) => {
          const innerW = W - PAD * 2;
          const x = PAD + (innerW / (preset.months.length - 1)) * i;
          return (
            <text key={m} x={x} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--od-muted)">
              {m}
            </text>
          );
        })}
      </svg>
      <div className="od-chart-legend">
        {LEGEND.map((item) => (
          <span key={item.key} className="od-chart-legend-item">
            <span className="od-chart-swatch" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="od-card-actions" style={{ justifyContent: "flex-end" }}>
        {(["6m", "3m", "1m"] as Range[]).map((r) => (
          <button
            key={r}
            aria-pressed={range === r}
            onClick={() => onChangeRange(r)}
            type="button"
          >
            {r === "6m" ? "6M" : r === "3m" ? "3M" : "1M"}
          </button>
        ))}
      </div>
    </div>
  );
}
