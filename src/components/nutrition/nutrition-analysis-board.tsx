"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Leaf } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { clampScore, structureScore } from "@/lib/life-os/selectors";
import { rainbowColors } from "@/lib/nutrition/color-signals";
import type { NutritionCategory, NutritionReport } from "@/lib/nutrition/types";

import type { TrendMonth } from "./nutrition-extras";
import "./nutrition.css";

type TrendState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; months: TrendMonth[]; tracked: ReadonlyArray<NutritionCategory> };

type ChartRow = {
  period: string;
  label: string;
  score: number;
  veg: number;
  protein: number;
  whole: number;
  bad: number;
};

const CATEGORY_LABELS: Record<NutritionCategory, string> = {
  蔬菜: "蔬菜",
  水果: "水果",
  全谷物: "全谷物",
  豆类: "豆类",
  坚果: "坚果",
  香料: "香料",
  动物性: "动物性",
  油脂: "油脂",
  含糖饮料: "含糖饮料",
  加工肉: "加工肉",
  反式零食: "反式零食",
  未分类: "未分类"
};

function makeTrendRows(months: TrendMonth[]): ChartRow[] {
  return months.map((month) => {
    const veg = (month.grams["蔬菜"] ?? 0) + (month.grams["水果"] ?? 0);
    const protein = (month.grams["豆类"] ?? 0) + (month.grams["坚果"] ?? 0) + (month.grams["动物性"] ?? 0);
    const whole = month.grams["全谷物"] ?? 0;
    const bad = (month.grams["加工肉"] ?? 0) + (month.grams["含糖饮料"] ?? 0) + (month.grams["反式零食"] ?? 0);
    const total = Object.values(month.grams).reduce((s, n) => s + n, 0) || 1;
    const score = clampScore(
      58 + (veg / total) * 30 + (protein / total) * 12 + (whole / total) * 14 - (bad / total) * 24
    );
    return {
      period: month.period,
      label: month.period.slice(5),
      score,
      veg: Math.round(veg),
      protein: Math.round(protein),
      whole: Math.round(whole),
      bad: Math.round(bad)
    };
  });
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function topCategoryItems(report: NutritionReport): Array<{ name: string; grams: number }> {
  return (Object.values(report.topByCategory).flat() as Array<{ name: string; grams: number }>)
    .sort((a, b) => b.grams - a.grams)
    .slice(0, 6);
}

function totalSkips(breakdown: NutritionReport["skipBreakdown"]): number {
  const keys: Array<keyof NutritionReport["skipBreakdown"]> = [
    "no_weight",
    "ambiguous_unit",
    "no_alias_match",
    "low_confidence",
    "noise"
  ];
  return keys.reduce((s, k) => s + breakdown[k], 0);
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="nut-state">
      <div className="nut-state__pulse" />
      <div>{label}</div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="nut-error">
      <AlertCircle aria-hidden />
      加载失败: {message}
    </div>
  );
}

function monthLabel(period: string): string {
  const [y, m] = period.split("-");
  if (!y || !m) return period;
  return `${y}年${parseInt(m, 10)}月`;
}

function describeScore(score: number): string {
  if (score >= 80) return "整体良好";
  if (score >= 65) return "中等偏稳";
  return "需要优先调整结构";
}

function RingProgress({ pct, size = 72, stroke = 7, color = "var(--life-green-strong)" }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg className="nut-ring" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke="var(--life-card-soft)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        strokeWidth={stroke}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

type NarrativeProps =
  | { period: string; score: number; grams: Record<string, number>; prevScore?: number; isCurrent?: false }
  | { report: NutritionReport; isCurrent: true };

function NarrativeForMonth(props: NarrativeProps) {
  if ("report" in props) {
    const { report } = props;
    const score = structureScore(report);
    const skipCount = totalSkips(report.skipBreakdown);
    const topItems = topCategoryItems(report);

    return (
      <div className="nut-narrative">
        <div className="nut-narrative__head">
          <span className="nut-narrative__eyebrow">本月诊断</span>
          <strong className="nut-narrative__score">{score}</strong>
          <span className="nut-narrative__status">{describeScore(score)}</span>
        </div>
        <div className="nut-narrative__signals">
          <div className="nut-narrative__signal">
            <span className="nut-dot nut-dot--good" />
            <strong>质量覆盖</strong>
            <span>
              {report.itemsWithWeight} / {report.itemsAnalyzed} 条带重量，覆盖 {Math.round(report.coveragePct * 100)}%
            </span>
          </div>
          {skipCount > 0 ? (
            <div className="nut-narrative__signal">
              <span className="nut-dot nut-dot--warn" />
              <strong>待补记录</strong>
              <span>{skipCount} 条需要补重量、别名或 OCR 信息</span>
            </div>
          ) : null}
          <div className="nut-narrative__signal">
            <span className="nut-dot nut-dot--good" />
            <strong>主要食材</strong>
            <span>{topItems.slice(0, 3).map((item) => item.name).join(" / ") || "暂无匹配食材"}</span>
          </div>
        </div>
      </div>
    );
  }

  const { period, score, grams, prevScore } = props;
  const veg = (grams["蔬菜"] ?? 0) + (grams["水果"] ?? 0);
  const protein = (grams["豆类"] ?? 0) + (grams["坚果"] ?? 0) + (grams["动物性"] ?? 0);
  const whole = grams["全谷物"] ?? 0;
  const bad = (grams["加工肉"] ?? 0) + (grams["含糖饮料"] ?? 0) + (grams["反式零食"] ?? 0);
  const total = veg + protein + whole + bad;
  const delta = prevScore !== undefined ? score - prevScore : undefined;

  let highlight = "整体结构平稳";
  if (bad > total * 0.15) highlight = "超加工类食品占比偏高";
  else if (veg > total * 0.4) highlight = "蔬果摄入充足";
  else if (whole < total * 0.1) highlight = "全谷物摄入偏低";

  return (
    <div className="nut-narrative">
      <div className="nut-narrative__head">
        <span className="nut-narrative__eyebrow">{monthLabel(period)}</span>
        <strong className="nut-narrative__score">{score}</strong>
        <span className="nut-narrative__status">
          {describeScore(score)}
          {delta !== undefined ? ` · ${delta >= 0 ? "+" : ""}${delta} 分` : null}
        </span>
      </div>
      <div className="nut-narrative__signals">
        <div className="nut-narrative__signal">
          <span className="nut-dot nut-dot--good" />
          <strong>结构亮点</strong>
          <span>{highlight}</span>
        </div>
        <div className="nut-narrative__signal">
          <span className="nut-dot nut-dot--good" />
          <strong>蔬果</strong>
          <span>{Math.round(veg)} g</span>
        </div>
        <div className="nut-narrative__signal">
          <span className="nut-dot nut-dot--good" />
          <strong>蛋白</strong>
          <span>{Math.round(protein)} g</span>
        </div>
        <div className="nut-narrative__signal">
          <span className="nut-dot nut-dot--good" />
          <strong>全谷</strong>
          <span>{Math.round(whole)} g</span>
        </div>
        <div className="nut-narrative__signal">
          <span className="nut-dot nut-dot--warn" />
          <strong>超加工</strong>
          <span>{Math.round(bad)} g</span>
        </div>
      </div>
    </div>
  );
}

function InteractiveTrendChart({
  rows,
  onHover,
  onLeave
}: {
  rows: ChartRow[];
  onHover: (period: string) => void;
  onLeave: () => void;
}) {
  return (
    <div className="nut-combined__chart">
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart
          data={rows}
          margin={{ bottom: 10, left: 0, right: 20, top: 20 }}
          onMouseMove={(state) => {
            if (state && typeof state === "object" && "activeLabel" in state) {
              const active = rows.find((r) => r.label === state.activeLabel);
              if (active) onHover(active.period);
            }
          }}
          onMouseLeave={onLeave}
        >
          <defs>
            <linearGradient id="nutrition-score-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--life-green-strong)" stopOpacity={0.32} />
              <stop offset="95%" stopColor="var(--life-green)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(15, 23, 42, 0.06)" strokeDasharray="3 6" vertical={false} />
          <XAxis axisLine={false} dataKey="label" tick={{ fill: "#50585E", fontSize: 12 }} tickLine={false} />
          <YAxis axisLine={false} domain={[0, 100]} tick={{ fill: "#50585E", fontSize: 12 }} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              borderRadius: 8,
              color: "var(--life-text)"
            }}
          />
          <Area
            dataKey="score"
            fill="url(#nutrition-score-fill)"
            stroke="var(--life-green-strong)"
            strokeWidth={2.5}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type BulletItem = {
  name: string;
  value: number;
  min: number;
  max: number;
  color: string;
};

function BulletChart({ items }: { items: BulletItem[] }) {
  return (
    <div className="nut-bullets">
      {items.map((item) => {
        const inRange = item.value >= item.min && item.value <= item.max;
        return (
          <div className="nut-bullet" key={item.name}>
            <div className="nut-bullet__head">
              <span>{item.name}</span>
              <strong>{Math.round(item.value)}%</strong>
            </div>
            <div className="nut-bullet__track">
              <span
                className="nut-bullet__range"
                style={{
                  left: `${item.min}%`,
                  width: `${item.max - item.min}%`,
                  background: item.color
                }}
              />
              <span
                className="nut-bullet__marker"
                style={{ left: `${Math.min(100, Math.max(0, item.value))}%`, borderColor: item.color }}
              />
            </div>
            <div className="nut-bullet__foot">
              <small>目标 {item.min}% - {item.max}%</small>
              <small className={inRange ? "nut-bullet__ok" : "nut-bullet__gap"}>
                {inRange ? "在区间内" : `差距 ${item.value < item.min ? item.min - item.value : item.value - item.max}%`}
              </small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Rec = { title: string; body: string; tone: "good" | "warn" | "bad" };

function Checklist({ items }: { items: Rec[] }) {
  return (
    <ul className="nut-checklist">
      {items.map((item) => (
        <li className="nut-checklist__item" data-tone={item.tone} key={item.title}>
          <span className="nut-checklist__check">
            {item.tone === "good" ? <CheckCircle2 aria-hidden /> : <Leaf aria-hidden />}
          </span>
          <div className="nut-checklist__body">
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </div>
          <span className="nut-checklist__tag">
            {item.tone === "bad" ? "优先级 高" : item.tone === "warn" ? "优先级 中" : "优先级 低"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StructureSection({ report }: { report: NutritionReport }) {
  const bullets: BulletItem[] = [
    { name: "蔬果", value: Math.round(report.plate.ratios.vegFruit * 100), min: 30, max: 50, color: "var(--life-green-strong)" },
    { name: "优质蛋白", value: Math.round(report.plate.ratios.protein * 100), min: 20, max: 30, color: "var(--life-blue)" },
    { name: "全谷物", value: Math.round(report.plate.ratios.wholeGrain * 100), min: 20, max: 30, color: "var(--life-yellow)" },
    { name: "超加工", value: Math.round(report.upf.upfShare * 100), min: 0, max: 10, color: "var(--life-danger)" },
    { name: "添加糖", value: Math.round((report.ahei.breakdown["含糖饮料"].gramsThisPeriod / Math.max(report.upf.totalWeight, 1)) * 100), min: 0, max: 5, color: "var(--life-subtle)" }
  ];

  const recommendations: Rec[] = [
    {
      title: "增加全谷物摄入",
      body: `当前全谷占比 ${pct(report.plate.ratios.wholeGrain)}，目标靠近 20% - 30%。`,
      tone: report.plate.ratios.wholeGrain >= 0.2 ? "good" : report.plate.ratios.wholeGrain >= 0.1 ? "warn" : "bad"
    },
    {
      title: "控制超加工食品",
      body: `超加工占比 ${pct(report.upf.upfShare)}，继续压低加工肉、含糖饮料和反式零食。`,
      tone: report.upf.grade === "好" ? "good" : report.upf.grade === "可" ? "warn" : "bad"
    },
    {
      title: "保持蔬果多样性",
      body: `彩虹饮食覆盖 ${rainbowColors.filter((c) => report.colorCounts[c] > 0).length} / ${rainbowColors.length} 个颜色。`,
      tone: "good"
    }
  ];

  const cats = (Object.keys(CATEGORY_LABELS) as NutritionCategory[])
    .map((cat) => ({ cat, items: report.topByCategory[cat] || [] }))
    .filter((group) => group.items.length > 0)
    .slice(0, 5);

  return (
    <div className="nut-screen nut-screen--structure">
      <section className="nut-panel nut-panel--wide">
        <div className="nut-section-head nut-section-head--compact">
          <div>
            <p className="nut-eyebrow">结构诊断</p>
            <h2>饮食结构 vs 目标区间</h2>
          </div>
        </div>
        <BulletChart items={bullets} />
      </section>

      <section className="nut-panel nut-panel--wide">
        <div className="nut-section-head nut-section-head--compact">
          <div>
            <p className="nut-eyebrow">下一步建议</p>
            <h2>只保留三件值得做的事</h2>
          </div>
        </div>
        <Checklist items={recommendations} />
      </section>

      <section className="nut-panel nut-panel--wide nut-drill">
        <div className="nut-section-head nut-section-head--compact">
          <div>
            <p className="nut-eyebrow">来源明细</p>
            <h2>按类别查看主要食材</h2>
          </div>
        </div>
        <div className="nut-drill__grid">
          {cats.map((group) => (
            <div className="nut-drill__group" key={group.cat}>
              <strong>{CATEGORY_LABELS[group.cat]}</strong>
              {group.items.slice(0, 3).map((item) => (
                <span key={item.name}>
                  {item.name}
                  <small>{Math.round(item.grams)} g</small>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function NutritionAnalysisBoard({
  report,
  trend
}: {
  report: NutritionReport;
  trend: TrendState;
}) {
  const [hoveredPeriod, setHoveredPeriod] = useState<string | null>(null);

  if (trend.kind === "loading") return <LoadingState label="趋势加载中..." />;
  if (trend.kind === "error") return <ErrorState message={trend.message} />;

  const rows = makeTrendRows(trend.months);
  const hoveredRow = hoveredPeriod ? rows.find((r) => r.period === hoveredPeriod) : null;

  const score = structureScore(report);
  const coverage = Math.round(report.coveragePct * 100);
  const skipCount = totalSkips(report.skipBreakdown);

  return (
    <div className="nut-analysis-board">
      <section className="nut-panel nut-panel--hero">
        <div className="nut-hero-board">
          <div className="nut-hero-board__main">
            <div>
              <p className="nut-eyebrow">营养与饮食结构综合分析</p>
              <h1>这个月的饮食质量是否稳定？</h1>
            </div>
            <div className="nut-hero-board__metrics">
              <div className="nut-hero-board__metric nut-hero-board__metric--primary">
                <RingProgress pct={score} />
                <div>
                  <strong>{score}</strong>
                  <span>综合质量</span>
                </div>
              </div>
              <div className="nut-hero-board__metric">
                <strong>{coverage}%</strong>
                <span>质量覆盖</span>
              </div>
              <div className="nut-hero-board__metric">
                <strong>{skipCount}</strong>
                <span>待补记录</span>
              </div>
            </div>
          </div>
          <div className="nut-hero-board__status">
            {describeScore(score)}
          </div>
        </div>
      </section>

      <section className="nut-panel nut-panel--combined">
        <div className="nut-section-head">
          <div>
            <p className="nut-eyebrow">趋势分析</p>
            <h2>近 6 个月营养质量走势</h2>
          </div>
          <span className="nut-combined__hint">悬停图表查看当月诊断</span>
        </div>
        <div className="nut-combined__body">
          <InteractiveTrendChart
            rows={rows}
            onHover={setHoveredPeriod}
            onLeave={() => setHoveredPeriod(null)}
          />
          <div className="nut-combined__narrative">
            {hoveredRow ? (
              <NarrativeForMonth
                grams={trend.months.find((m) => m.period === hoveredRow.period)?.grams ?? {}}
                period={hoveredRow.period}
                prevScore={rows[rows.indexOf(hoveredRow) - 1]?.score}
                score={hoveredRow.score}
              />
            ) : (
              <NarrativeForMonth report={report} isCurrent />
            )}
          </div>
        </div>
      </section>

      <StructureSection report={report} />
    </div>
  );
}
