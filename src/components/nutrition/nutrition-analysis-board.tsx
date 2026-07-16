"use client";

import { CheckCircle2, Leaf } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { structureScore } from "@/lib/life-os/selectors";
import { rainbowColors } from "@/lib/nutrition/color-signals";
import type { NutritionCategory, NutritionReport } from "@/lib/nutrition/types";

import type { TrendMonth } from "./nutrition-extras";
import "./nutrition.css";
import { AnalysisViewTabs, type AnalysisViewTab } from "@/components/shared/analysis-view-tabs";

export type NutritionView = "overview" | "trend" | "structure" | "data";

const NUTRITION_TABS: readonly AnalysisViewTab[] = [
  { id: "overview", label: "结论" },
  { id: "trend", label: "趋势" },
  { id: "structure", label: "结构" },
  { id: "data", label: "数据质量" }
];

type TrendState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; months: TrendMonth[]; tracked: ReadonlyArray<NutritionCategory> };

type ChartRow = {
  period: string;
  label: string;
  score: number | null;
};

const CATEGORY_LABELS: Record<NutritionCategory, string> = {
  蔬菜: "蔬菜",
  淀粉类蔬菜: "淀粉类蔬菜",
  水果: "水果",
  全谷物: "全谷物",
  精制谷物: "精制谷物",
  豆类: "豆类",
  坚果: "坚果",
  香料: "香料",
  动物性: "优质蛋白",
  油脂: "油脂",
  含糖饮料: "含糖饮料",
  加工肉: "加工肉",
  甜点: "甜点",
  未分类: "未分类"
};

function makeTrendRows(months: TrendMonth[]): ChartRow[] {
  return months.map((month) => {
    return {
      period: month.period,
      label: month.period.slice(5),
      score: month.score
    };
  });
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatGrams(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} kg`;
  return `${Math.round(value)} g`;
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

function foodItemCount(report: NutritionReport): number {
  return Math.max(0, report.itemsAnalyzed - report.skipBreakdown.not_nutrition);
}

function foodCoveragePct(report: NutritionReport): number {
  const denominator = foodItemCount(report);
  if (denominator <= 0) return 0;
  return Math.round((report.itemsWithWeight / denominator) * 100);
}

function describeScore(score: number): string {
  if (score >= 80) return "整体良好";
  if (score >= 65) return "中等偏稳";
  return "需要优先调整结构";
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
  return <div className="nut-error">加载失败: {message}</div>;
}

function RingProgress({
  pct,
  size = 56,
  stroke = 5,
  color = "var(--life-green-strong)"
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg className="nut-ring" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke="var(--life-card-soft)"
        strokeWidth={stroke}
      />
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

function scoreForReport(report: NutritionReport): number {
  return report.v2?.scores.composite.score ?? structureScore(report);
}

function formatOneDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatComponentValue(component: NonNullable<NutritionReport["v2"]>["components"][number]): string {
  if (component.available === false) return component.reason ?? "数据源缺失";
  if (component.unit === "g_per_day") return `${formatOneDecimal(component.rawValue)} g/日`;
  if (component.unit === "ratio") return `${Math.round(component.rawValue * 100)}%`;
  if (component.unit === "count") return `${Math.round(component.rawValue)} 项`;
  return `${formatOneDecimal(component.rawValue)}`;
}

function KpiRow({ report }: { report: NutritionReport }) {
  const score = scoreForReport(report);
  const v2Confidence = report.v2?.confidence;
  const coverage = v2Confidence ? Math.round(v2Confidence.nutritionCoverage * 100) : foodCoveragePct(report);
  const skipCount = totalSkips(report.skipBreakdown);
  const status = report.v2?.scores.composite.lowConfidence ? "结论低可信" : describeScore(score);

  return (
    <div className="nut-kpis">
      <div className="nut-kpi">
        <RingProgress pct={score} />
        <div>
          <strong className="nut-kpi__value">{score}</strong>
          <span className="nut-kpi__label">{report.v2 ? "v2 综合质量" : "综合质量"}</span>
        </div>
      </div>
      <div className="nut-kpi">
        <strong className="nut-kpi__value">{coverage}%</strong>
        <span className="nut-kpi__label">营养覆盖</span>
      </div>
      <div className="nut-kpi">
        <strong className="nut-kpi__value">{skipCount}</strong>
        <span className="nut-kpi__label">待补记录</span>
      </div>
      <div className="nut-kpi nut-kpi--vertical">
        <span className="nut-kpi__label">购买口径可信度</span>
        <span className="nut-kpi__pill">{v2Confidence ? v2Confidence.grade : status}</span>
      </div>
    </div>
  );
}

function NutritionConclusionPanel({ report }: { report: NutritionReport }) {
  const score = scoreForReport(report);
  const negative = report.v2?.drivers.negative[0];
  const positive = report.v2?.drivers.positive[0];
  const confidence = report.v2?.confidence;
  const status = report.v2?.scores.composite.lowConfidence ? "结论需要谨慎解读" : describeScore(score);

  return (
    <section className="nut-panel nut-panel--conclusion">
      <div className="nut-section-head nut-section-head--compact">
        <div>
          <p className="nut-eyebrow">本月结论</p>
          <h2>营养质量{status}</h2>
        </div>
        <span className="nut-status-pill">购买口径</span>
      </div>
      <div className="nut-conclusion-grid">
        <div className="nut-conclusion-lead">
          <strong>{negative?.label ?? "当前没有明确拖累项"}</strong>
          <span>{negative?.explanation ?? "继续积累可计重的食品记录，结论会更稳定。"}</span>
        </div>
        <div className="nut-conclusion-stat">
          <span>可信度</span>
          <strong>{confidence?.grade ?? "—"}</strong>
          <small>{confidence ? `${Math.round(confidence.nutritionCoverage * 100)}% 食品项可量化` : "等待数据质量"}</small>
        </div>
        <div className="nut-conclusion-stat">
          <span>主要加分</span>
          <strong>{positive?.label ?? "暂无"}</strong>
          <small>{positive?.metric ?? "需要更多记录"}</small>
        </div>
      </div>
    </section>
  );
}

function DataQualityPanel({ report }: { report: NutritionReport }) {
  const v2Confidence = report.v2?.confidence;
  const foodItems = v2Confidence?.foodItemCount ?? foodItemCount(report);
  const pending = totalSkips(report.skipBreakdown);
  const excluded = v2Confidence?.notNutritionCount ?? report.skipBreakdown.not_nutrition;
  const coverage = v2Confidence ? Math.round(v2Confidence.nutritionCoverage * 100) : foodCoveragePct(report);
  const rows = [
    { label: "食物项", value: foodItems, meta: "参与营养判断" },
    { label: "有重量", value: v2Confidence?.itemsWithWeight ?? report.itemsWithWeight, meta: `${coverage}% 可量化` },
    { label: "待补", value: pending, meta: "别名/重量/单位/OCR" },
    { label: "已排除", value: excluded, meta: "非食物项" }
  ];

  return (
    <section className="nut-panel nut-panel--quality">
      <div className="nut-section-head nut-section-head--compact">
        <div>
          <p className="nut-eyebrow">数据可用性</p>
          <h2>营养分析用到哪些账单项</h2>
        </div>
      </div>
      <div className="nut-quality-grid">
        {rows.map((row) => (
          <div className="nut-quality-card" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.meta}</small>
          </div>
        ))}
      </div>
      <div className="nut-quality-note">
        非食物项不会被当成坏数据；只有食物项缺别名、重量或单位时才进入待补。所有重量都是购买口径。
      </div>
    </section>
  );
}

function V2ScorePanel({ report }: { report: NutritionReport }) {
  const v2 = report.v2;
  if (!v2) return null;
  const axes = [
    { key: "plate", label: "Plate", score: v2.scores.plate.score, meta: `偏差 ${v2.scores.plate.deviation}` },
    { key: "ahei", label: "AHEI-like", score: v2.scores.ahei.score, meta: `${v2.scores.ahei.components.length} 个可用组件` },
    { key: "upf", label: "UPF", score: v2.scores.upf.score, meta: `UPF ${Math.round(v2.scores.upf.upfShare * 100)}%` },
    { key: "diversity", label: "Diversity", score: v2.scores.diversity.score, meta: `${v2.scores.diversity.uniqueFoodCount}/${v2.scores.diversity.uniqueFoodTarget} 种` }
  ];
  const components = v2.components.slice(0, 12);

  return (
    <section className="nut-panel nut-panel--v2">
      <div className="nut-section-head nut-section-head--compact">
        <div>
          <p className="nut-eyebrow">v2 score components</p>
          <h2>分数拆解与可用分母</h2>
        </div>
        <span className="nut-status-pill">购买口径</span>
      </div>
      <div className="nut-v2-axis-grid">
        {axes.map((axis) => (
          <div className="nut-v2-axis" key={axis.key}>
            <div className="nut-v2-axis__head">
              <span>{axis.label}</span>
              <strong>{axis.score}</strong>
            </div>
            <div className="nut-v2-axis__track">
              <span style={{ width: `${Math.min(100, Math.max(0, axis.score))}%` }} />
            </div>
            <small>{axis.meta}</small>
          </div>
        ))}
      </div>
      <div className="nut-v2-components" aria-label="AHEI-like 组件">
        {components.map((component) => (
          <div className="nut-v2-component" data-unavailable={component.available === false ? "true" : undefined} key={component.key}>
            <div>
              <strong>{component.label}</strong>
              <span>{formatComponentValue(component)}</span>
            </div>
            <b>{component.available === false ? "—" : `${component.score}/10`}</b>
          </div>
        ))}
      </div>
      <div className="nut-quality-note">
        分母：{v2.confidence.itemsWithWeight}/{v2.confidence.foodItemCount} 个食品项可计重；{v2.confidence.notNutritionCount} 个非食物项已排除。数据质量只影响可信度，不混入健康分。
      </div>
    </section>
  );
}

function DriversPanel({ report }: { report: NutritionReport }) {
  const v2 = report.v2;
  if (!v2) return null;
  const drivers = [...v2.drivers.negative, ...v2.drivers.positive];

  return (
    <section className="nut-panel nut-panel--drivers">
      <div className="nut-section-head nut-section-head--compact">
        <div>
          <p className="nut-eyebrow">drivers</p>
          <h2>本月主要拖累与加分项</h2>
        </div>
      </div>
      {drivers.length === 0 ? (
        <div className="nut-chart-empty">暂无明确 driver；需要更多可计重食品记录</div>
      ) : (
        <div className="nut-driver-list">
          {drivers.map((driver) => (
            <div className="nut-driver" data-direction={driver.direction} key={driver.key}>
              <div className="nut-driver__head">
                <strong>{driver.label}</strong>
                <span>{driver.direction === "negative" ? "拖累" : "加分"}</span>
              </div>
              <p>{driver.explanation}</p>
              <small>{driver.metric}</small>
            </div>
          ))}
        </div>
      )}
      <div className="nut-quality-note">
        {v2.confidence.reasons.length > 0 ? v2.confidence.reasons.join("；") : "本月营养覆盖良好。"}
      </div>
    </section>
  );
}

function TrendChart({ rows }: { rows: ChartRow[] }) {
  const scores = rows.flatMap((r) => (r.score === null ? [] : [r.score]));
  if (scores.length === 0) {
    return <div className="nut-chart-empty">当前时间范围暂无可比较的营养数据</div>;
  }
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const step = 5;
  const yMin = Math.max(0, Math.floor(minScore / step) * step - step);
  const yMax = Math.min(100, Math.ceil(maxScore / step) * step + step);
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax; v += step) {
    ticks.push(v);
  }

  return (
    <div className="nut-chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={rows}
          margin={{ bottom: 8, left: -20, right: 16, top: 16 }}
        >
          <defs>
            <linearGradient id="nutrition-score-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--life-green-strong)" stopOpacity={0.32} />
              <stop offset="95%" stopColor="var(--life-green)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(15, 23, 42, 0.06)" strokeDasharray="3 6" vertical={false} />
          <XAxis axisLine={false} dataKey="label" tick={{ fill: "#6b7280", fontSize: 12 }} tickLine={false} />
          <YAxis axisLine={false} domain={[yMin, yMax]} ticks={ticks} tick={{ fill: "#6b7280", fontSize: 12 }} tickLine={false} />
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

function TrendPanel({ rows }: { rows: ChartRow[] }) {
  return (
    <section className="nut-panel nut-panel--trend">
      <div className="nut-section-head nut-section-head--compact">
        <div>
          <p className="nut-eyebrow">趋势分析</p>
          <h2>近 6 个月营养质量走势</h2>
        </div>
        <span className="nut-hint">悬停图表查看当月诊断</span>
      </div>
      <TrendChart rows={rows} />
    </section>
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
    <div className="nut-bullets nut-bullets--compact">
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
              <small>
                目标 {item.min}% - {item.max}%
              </small>
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

function StructurePanel({ report }: { report: NutritionReport }) {
  const bullets: BulletItem[] = [
    {
      name: "蔬果",
      value: Math.round(report.plate.ratios.vegFruit * 100),
      min: 30,
      max: 50,
      color: "var(--life-green-strong)"
    },
    {
      name: "优质蛋白",
      value: Math.round(report.plate.ratios.protein * 100),
      min: 20,
      max: 30,
      color: "var(--life-blue)"
    },
    {
      name: "全谷物",
      value: Math.round(report.plate.ratios.wholeGrain * 100),
      min: 20,
      max: 30,
      color: "var(--life-yellow)"
    },
    {
      name: "超加工",
      value: Math.round(report.upf.upfShare * 100),
      min: 0,
      max: 10,
      color: "var(--life-danger)"
    },
    {
      name: "添加糖",
      value: Math.round(
        (report.ahei.breakdown["含糖饮料"].gramsThisPeriod / Math.max(report.upf.totalWeight, 1)) * 100
      ),
      min: 0,
      max: 5,
      color: "var(--life-subtle)"
    }
  ];

  return (
    <section className="nut-panel nut-panel--structure">
      <div className="nut-section-head nut-section-head--compact">
        <div>
          <p className="nut-eyebrow">结构诊断</p>
          <h2>饮食结构 vs 目标区间</h2>
        </div>
      </div>
      <BulletChart items={bullets} />
    </section>
  );
}

function TaxonomyPanel({ grams }: { grams: Record<NutritionCategory, number> }) {
  const total = Object.values(grams).reduce((sum, value) => sum + value, 0) || 1;
  const items: Array<{ category: NutritionCategory; label: string; tone: "good" | "neutral" | "watch" }> = [
    { category: "蔬菜", label: "非淀粉蔬菜", tone: "good" },
    { category: "淀粉类蔬菜", label: "淀粉类蔬菜", tone: "neutral" },
    { category: "全谷物", label: "全谷物", tone: "good" },
    { category: "精制谷物", label: "精制谷物", tone: "watch" },
    { category: "甜点", label: "甜点", tone: "watch" },
    { category: "油脂", label: "油脂", tone: "neutral" },
    { category: "香料", label: "香料", tone: "neutral" }
  ];

  return (
    <section className="nut-panel nut-panel--taxonomy">
      <div className="nut-section-head nut-section-head--compact">
        <div>
          <p className="nut-eyebrow">分类结构</p>
          <h2>按新分类口径看本月食物</h2>
        </div>
      </div>
      <div className="nut-taxonomy-grid">
        {items.map((item) => {
          const value = grams[item.category] ?? 0;
          const share = Math.round((value / total) * 100);
          return (
            <div className="nut-taxonomy-card" data-tone={item.tone} key={item.category}>
              <div className="nut-taxonomy-card__head">
                <span>{item.label}</span>
                <strong>{share}%</strong>
              </div>
              <div className="nut-taxonomy-card__bar">
                <span style={{ width: `${Math.min(100, share)}%` }} />
              </div>
              <small>{formatGrams(value)}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type Rec = { title: string; body: string; tone: "good" | "warn" | "bad" };

function Checklist({ items }: { items: Rec[] }) {
  return (
    <ul className="nut-checklist nut-checklist--compact">
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

function RecommendationsPanel({ report }: { report: NutritionReport }) {
  const rainbowHit = rainbowColors.filter((c) => report.colorCounts[c] > 0).length;

  const recommendations: Rec[] = [
    {
      title: "增加全谷物摄入",
      body: `当前全谷占比 ${pct(report.plate.ratios.wholeGrain)}，目标靠近 20% - 30%。`,
      tone: report.plate.ratios.wholeGrain >= 0.2 ? "good" : report.plate.ratios.wholeGrain >= 0.1 ? "warn" : "bad"
    },
    {
      title: "控制超加工食品",
      body: `超加工占比 ${pct(report.upf.upfShare)}，继续压低加工肉、含糖饮料、精制谷物和甜点。`,
      tone: report.upf.grade === "好" ? "good" : report.upf.grade === "可" ? "warn" : "bad"
    },
    {
      title: "保持蔬果多样性",
      body: `彩虹饮食覆盖 ${rainbowHit} / ${rainbowColors.length} 个颜色。`,
      tone: "good"
    }
  ];

  return (
    <section className="nut-panel nut-panel--recommendations">
      <div className="nut-section-head nut-section-head--compact">
        <div>
          <p className="nut-eyebrow">下一步建议</p>
          <h2>只保留三件值得做的事</h2>
        </div>
      </div>
      <Checklist items={recommendations} />
    </section>
  );
}

function DrillPanel({ report }: { report: NutritionReport }) {
  const groups = (Object.keys(CATEGORY_LABELS) as NutritionCategory[])
    .map((cat) => ({
      cat,
      label: CATEGORY_LABELS[cat],
      items: report.topByCategory[cat] || []
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => {
      const totalA = a.items.reduce((s, it) => s + (it.grams || 0), 0);
      const totalB = b.items.reduce((s, it) => s + (it.grams || 0), 0);
      return totalB - totalA;
    })
    .slice(0, 5);

  return (
    <section className="nut-panel nut-panel--drill">
      <div className="nut-section-head nut-section-head--compact">
        <div>
          <p className="nut-eyebrow">来源明细</p>
          <h2>按类别查看主要食材</h2>
        </div>
      </div>
      <div className="nut-drill__grid nut-drill__grid--compact">
        {groups.map((group) => (
          <div className="nut-drill__group" key={group.cat}>
            <strong>{group.label}</strong>
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
  );
}

export function NutritionAnalysisBoard({
  report,
  trend,
  view,
  onViewChange
}: {
  report: NutritionReport;
  trend: TrendState;
  view: NutritionView;
  onViewChange: (view: NutritionView) => void;
}) {
  if (trend.kind === "loading") return <LoadingState label="趋势加载中..." />;
  if (trend.kind === "error") return <ErrorState message={trend.message} />;

  const rows = makeTrendRows(trend.months);
  const currentMonth = trend.months.find((month) => month.period === report.period) ?? trend.months.at(-1);
  const grams = currentMonth?.grams ?? ({} as Record<NutritionCategory, number>);

  return (
    <div className="nut-analysis-board">
      <KpiRow report={report} />
      <AnalysisViewTabs ariaLabel="营养分析视图" onChange={(next) => onViewChange(next as NutritionView)} tabs={NUTRITION_TABS} value={view} />
      {view === "overview" ? (
        <div className="nut-focus-grid">
          <NutritionConclusionPanel report={report} />
          <DriversPanel report={report} />
          <RecommendationsPanel report={report} />
          <DataQualityPanel report={report} />
        </div>
      ) : null}
      {view === "trend" ? <div className="nut-analysis-grid"><TrendPanel rows={rows} /></div> : null}
      {view === "structure" ? (
        <div className="nut-analysis-grid">
          <V2ScorePanel report={report} />
          <StructurePanel report={report} />
          <TaxonomyPanel grams={grams} />
        </div>
      ) : null}
      {view === "data" ? (
        <div className="nut-analysis-grid">
          <DataQualityPanel report={report} />
          <DrillPanel report={report} />
        </div>
      ) : null}
    </div>
  );
}
