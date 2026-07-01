"use client";

/**
 * `/nutrition` module. Three internal sub-tabs:
 *   - 今日判断 (today)
 *   - 结构诊断 (structure)
 *   - 趋势分析 (trend)
 *
 * Sidebar selection (营养) is handled by LifeSidebar; this component only
 * manages the in-page tab nav. Data fetching is duplicated from the legacy
 * NutritionDashboard intentionally — the legacy file is kept in place but
 * no longer imported by the routes, so we can drop unused pieces later
 * without blocking this refactor.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { AlertCircle, CircleGauge, Leaf, LineChartIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { fromCents, formatMoney } from "@/lib/expenses/money";
import type {
  ExpenseAnalytics,
  ExpenseReceiptSummary
} from "@/lib/expenses/types";
import { clampScore, structureScore } from "@/lib/life-os/selectors";
import { rainbowColors } from "@/lib/nutrition/color-signals";
import { type SkipBreakdown } from "@/lib/nutrition/quality";
import type {
  CategoryTopItem,
  NutritionCategory,
  NutritionReport
} from "@/lib/nutrition/types";

import {
  currentMonth,
  LoadingPanel as ExpenseLoadingPanel,
  uploadTimingSummary,
  type ManualExpenseInput,
  type UploadFailure
} from "@/components/expenses/shared/task-helpers";
import { StructureTask as ExpenseStructureTask } from "@/components/expenses/structure-task";
import { ExpensesHeader } from "@/components/expenses/shared/expenses-header";
import { useExpenseData } from "@/components/expenses/shared/use-expense-data";
import { SubTabNav, type SubTab } from "@/components/shared/sub-tab-nav";
import type { TrendMonth } from "./nutrition-extras";

import "@/components/expenses/expenses.css";
import "./nutrition.css";

type NutritionTask = "today" | "structure" | "trend";

const TASKS: ReadonlyArray<SubTab<NutritionTask>> = [
  { id: "today", label: "今日判断", icon: CircleGauge },
  { id: "structure", label: "结构诊断", icon: Leaf },
  { id: "trend", label: "趋势分析", icon: LineChartIcon }
];

const REASON_ORDER = [
  "no_weight",
  "ambiguous_unit",
  "no_alias_match",
  "low_confidence",
  "noise"
] as const;

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

const STRUCTURE_COLORS = [
  "var(--life-green-strong)",
  "var(--life-blue)",
  "var(--life-yellow)",
  "var(--life-danger)",
  "var(--life-subtle)"
];

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; report: NutritionReport };

type TrendState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; months: TrendMonth[]; tracked: ReadonlyArray<NutritionCategory> };

function runTaskTransition(update: () => void) {
  if (typeof document === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const transitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };
  if (typeof transitionDocument.startViewTransition !== "function") {
    update();
    return;
  }
  transitionDocument.startViewTransition(update);
}

function formatYYYYMM(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function listMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    out.push(formatYYYYMM(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

function formatGrams(g: number | null): string {
  if (g === null) return "待确认";
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
  return `${Math.round(g)} g`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function totalSkips(breakdown: SkipBreakdown): number {
  return REASON_ORDER.reduce((s, r) => s + breakdown[r], 0);
}

function statusTone(value: number, min: number, max: number): "good" | "warn" | "bad" {
  if (value >= min && value <= max) return "good";
  if (Math.abs(value - min) < 8 || Math.abs(value - max) < 8) return "warn";
  return "bad";
}

function topCategoryItems(report: NutritionReport): CategoryTopItem[] {
  return (Object.values(report.topByCategory).flat() as CategoryTopItem[])
    .sort((a, b) => b.grams - a.grams)
    .slice(0, 6);
}

function makeTrendRows(months: TrendMonth[]) {
  return months.map((month, index) => {
    const veg = (month.grams.蔬菜 ?? 0) + (month.grams.水果 ?? 0);
    const protein = (month.grams.豆类 ?? 0) + (month.grams.坚果 ?? 0) + (month.grams.动物性 ?? 0);
    const whole = month.grams.全谷物 ?? 0;
    const bad = (month.grams.加工肉 ?? 0) + (month.grams.含糖饮料 ?? 0) + (month.grams.反式零食 ?? 0);
    const total = Object.values(month.grams).reduce((s, n) => s + n, 0) || 1;
    const score = clampScore(58 + (veg / total) * 30 + (protein / total) * 12 + (whole / total) * 14 - (bad / total) * 24);
    return {
      period: month.period,
      label: month.period.slice(5),
      score,
      veg: Math.round(veg),
      protein: Math.round(protein),
      whole: Math.round(whole),
      bad: Math.round(bad),
      index
    };
  });
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

function MonthControl({ months, period, onChange }: { months: string[]; period: string; onChange: (period: string) => void }) {
  return (
    <label className="nut-month">
      <span>月份</span>
      <select onChange={(e) => onChange(e.target.value)} value={period}>
        {months.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </label>
  );
}

function TodayView({
  expenseAnalytics,
  months,
  onPeriodChange,
  period,
  report
}: {
  report: NutritionReport;
  months: string[];
  period: string;
  onPeriodChange: (period: string) => void;
  expenseAnalytics: ExpenseAnalytics | null;
}) {
  const score = structureScore(report);
  const skipCount = totalSkips(report.skipBreakdown);
  const topItems = topCategoryItems(report);
  const rings = [
    { name: "PDI", value: Math.round((report.pdi.total / report.pdi.max) * 100), fill: "var(--life-green-strong)" },
    { name: "AHEI", value: Math.round((report.ahei.total / report.ahei.max) * 100), fill: "var(--life-blue)" },
    { name: "餐盘", value: clampScore((1 - report.plate.deviation) * 100), fill: "var(--life-yellow)" },
    { name: "UPF", value: clampScore((1 - report.upf.upfShare) * 100), fill: "var(--life-danger)" }
  ];

  return (
    <div className="nut-screen">
      <section className="nut-panel nut-panel--hero">
        <div className="nut-section-head">
          <div>
            <p className="nut-eyebrow">今日判断</p>
            <h1>这个月的饮食质量是否稳定？</h1>
          </div>
          <MonthControl months={months} period={period} onChange={onPeriodChange} />
        </div>
        <div className="nut-judgement">
          <div>
            <div className="nut-judgement__score">{score}</div>
            <div className="nut-judgement__label">综合营养质量</div>
            <div className="nut-judgement__status">
              {score >= 80 ? "整体良好，重点补全薄弱项" : score >= 65 ? "中等偏稳，结构仍需调整" : "需要优先修正结构"}
            </div>
          </div>
          <ResponsiveContainer height={300} width="100%">
            <RadialBarChart data={rings} endAngle={-270} innerRadius="24%" outerRadius="94%" startAngle={90}>
              <PolarAngleAxis angleAxisId={0} domain={[0, 100]} tick={false} type="number" />
              <RadialBar background cornerRadius={8} dataKey="value" />
              <Tooltip formatter={(value) => [`${value}%`, "达成"]} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {expenseAnalytics ? (
        <section className="nut-panel nut-panel--expense-stats">
          <div className="nut-expense-stats">
            <div>
              <span>本月已花</span>
              <strong>{formatMoney(fromCents(expenseAnalytics.budget_progress.spent), expenseAnalytics.primary_currency)}</strong>
            </div>
            <div>
              <span>剩余预算</span>
              <strong>{formatMoney(fromCents(expenseAnalytics.budget_progress.remaining), expenseAnalytics.budget_currency)}</strong>
            </div>
            <div>
              <span>待确认票据</span>
              <strong>{expenseAnalytics.pending_receipts.length}</strong>
            </div>
          </div>
        </section>
      ) : (
        <section className="nut-panel nut-panel--expense-stats">
          <div className="nut-expense-stats">
            <div><span>支出数据</span><strong>加载中</strong></div>
          </div>
        </section>
      )}

      <section className="nut-panel nut-panel--wide">
        <div className="nut-section-head nut-section-head--compact">
          <div>
            <p className="nut-eyebrow">需要注意</p>
            <h2>本月最影响判断的信号</h2>
          </div>
        </div>
        <div className="nut-signal-list">
          <div className="nut-signal">
            <span className="nut-dot nut-dot--good" />
            <strong>质量覆盖</strong>
            <span>{report.itemsWithWeight} / {report.itemsAnalyzed} 条带重量，覆盖 {Math.round(report.coveragePct * 100)}%</span>
          </div>
          <div className="nut-signal">
            <span className="nut-dot nut-dot--warn" />
            <strong>未计入记录</strong>
            <span>{skipCount} 条需要补重量、别名或 OCR 信息</span>
          </div>
          <div className="nut-signal">
            <span className="nut-dot nut-dot--good" />
            <strong>主要食材</strong>
            <span>{topItems.slice(0, 3).map((item) => item.name).join(" / ") || "暂无匹配食材"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function StructureView({ expenseAnalytics, report }: { expenseAnalytics: ExpenseAnalytics | null; report: NutritionReport }) {
  const plate = [
    { name: "蔬果", value: report.plate.ratios.vegFruit, target: "30% - 50%", min: 30, max: 50 },
    { name: "优质蛋白", value: report.plate.ratios.protein, target: "20% - 30%", min: 20, max: 30 },
    { name: "全谷物", value: report.plate.ratios.wholeGrain, target: "20% - 30%", min: 20, max: 30 },
    { name: "超加工", value: report.upf.upfShare, target: "0% - 10%", min: 0, max: 10 },
    { name: "添加糖", value: (report.ahei.breakdown.含糖饮料.gramsThisPeriod / Math.max(report.upf.totalWeight, 1)), target: "0% - 5%", min: 0, max: 5 }
  ].map((item, index) => ({
    ...item,
    color: STRUCTURE_COLORS[index],
    percent: Math.round(item.value * 100),
    tone: statusTone(Math.round(item.value * 100), item.min, item.max)
  }));
  const score = structureScore(report);
  const recommendations = [
    { title: "增加全谷物摄入", body: `当前全谷占比 ${pct(report.plate.ratios.wholeGrain)}，目标靠近 20% - 30%。`, tone: "warn" },
    { title: "控制超加工食品", body: `超加工占比 ${pct(report.upf.upfShare)}，继续压低加工肉、含糖饮料和反式零食。`, tone: report.upf.grade === "好" ? "good" : "bad" },
    { title: "保持蔬果多样性", body: `彩虹饮食覆盖 ${rainbowColors.filter((c) => report.colorCounts[c] > 0).length} / ${rainbowColors.length} 个颜色。`, tone: "good" }
  ];

  return (
    <>
      <div className="nut-screen nut-screen--structure">
        <section className="nut-panel nut-panel--allocation">
          <div className="nut-section-head">
            <div>
              <p className="nut-eyebrow">结构诊断</p>
              <h1>本月饮食结构</h1>
            </div>
            <div className="nut-summary-number">
              <span>{score}</span>
              <small>结构平衡度</small>
            </div>
          </div>
          <div className="nut-allocation">
            <ResponsiveContainer height={420} width="100%">
              <PieChart>
                <Pie
                  cx="50%"
                  cy="50%"
                  data={plate}
                  dataKey="percent"
                  innerRadius={112}
                  outerRadius={184}
                  paddingAngle={1.5}
                  stroke="#081012"
                  strokeWidth={2}
                >
                  {plate.map((entry) => (
                    <Cell fill={entry.color} key={entry.name} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value}%`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="nut-allocation__center">
              <strong>{score}</strong>
              <span>结构平衡度</span>
            </div>
          </div>
          <div className="nut-legend">
            {plate.map((item) => (
              <span key={item.name}><i style={{ background: item.color }} />{item.name} {item.percent}%</span>
            ))}
          </div>
        </section>

        <section className="nut-panel nut-panel--side">
          <div className="nut-section-head nut-section-head--compact">
            <div>
              <p className="nut-eyebrow">目标偏移</p>
              <h2>结构是否落在目标区间</h2>
            </div>
          </div>
          <div className="nut-bars">
            {plate.map((item) => (
              <div className="nut-bar-row" data-tone={item.tone} key={item.name}>
                <div className="nut-bar-row__meta">
                  <span><i style={{ background: item.color }} />{item.name}</span>
                  <strong>{item.percent}%</strong>
                </div>
                <div className="nut-range">
                  <span style={{ width: `${Math.min(100, Math.max(5, item.percent))}%`, background: item.color }} />
                </div>
                <div className="nut-bar-row__foot">
                  <small>{item.target}</small>
                  <small>{item.tone === "good" ? "达标" : item.tone === "warn" ? "轻度偏离" : "显著偏离"}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="nut-panel nut-panel--wide">
          <div className="nut-section-head nut-section-head--compact">
            <div>
              <p className="nut-eyebrow">下一步建议</p>
              <h2>只保留三件值得做的事</h2>
            </div>
          </div>
          <div className="nut-action-list">
            {recommendations.map((item) => (
              <div className="nut-action" data-tone={item.tone} key={item.title}>
                <Leaf aria-hidden />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </div>
                <span className="nut-priority">{item.tone === "bad" ? "优先级: 高" : item.tone === "warn" ? "优先级: 中" : "优先级: 低"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      {expenseAnalytics ? (
        <div className="life-os-nutrition__legacy" data-variant="expense-legacy">
          <ExpenseStructureTask analytics={expenseAnalytics} />
        </div>
      ) : (
        <ExpenseLoadingPanel />
      )}
    </>
  );
}

function TrendView({
  report,
  trend
}: {
  report: NutritionReport;
  trend: TrendState;
}) {
  if (trend.kind === "loading") return <LoadingState label="趋势加载中..." />;
  if (trend.kind === "error") return <ErrorState message={trend.message} />;
  const rows = makeTrendRows(trend.months);
  const current = rows[rows.length - 1]?.score ?? structureScore(report);
  const first = rows[0]?.score ?? current;
  const delta = current - first;
  const contributions = [
    { name: "蛋白", value: 2.3, color: "var(--life-green-strong)" },
    { name: "蔬果", value: 1.8, color: "var(--life-green)" },
    { name: "全谷", value: 1.2, color: "var(--life-blue)" },
    { name: "超加工", value: -1.1, color: "var(--life-yellow)" },
    { name: "添加糖", value: -0.9, color: "var(--life-danger)" }
  ];

  return (
    <>
      <div className="nut-screen nut-screen--trend">
        <section className="nut-panel nut-panel--chart">
          <div className="nut-section-head">
            <div>
              <p className="nut-eyebrow">趋势分析</p>
              <h1>营养质量趋势</h1>
              <div className="nut-chart-metric">
                <strong>{current}</strong>
                <span>{delta >= 0 ? "+" : ""}{delta} 分 · 较 {trend.months.length} 月前</span>
              </div>
            </div>
            <div className="nut-segment" aria-label="时间范围">
              <span>7天</span>
              <span>30天</span>
              <span data-active="true">90天</span>
              <span>12个月</span>
            </div>
          </div>
          <ResponsiveContainer height={430} width="100%">
            <AreaChart data={rows} margin={{ bottom: 10, left: 0, right: 20, top: 20 }}>
              <defs>
                <linearGradient id="nutrition-score-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--life-green-strong)" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="var(--life-green)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(15, 23, 42, 0.06)" strokeDasharray="3 6" vertical={false} />
              <XAxis axisLine={false} dataKey="period" tick={{ fill: "#50585E", fontSize: 12 }} tickLine={false} />
              <YAxis axisLine={false} domain={[0, 100]} tick={{ fill: "#50585E", fontSize: 12 }} tickLine={false} />
              <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.08)", borderRadius: 8, color: "var(--life-text)" }} />
              <Area dataKey="score" fill="url(#nutrition-score-fill)" stroke="var(--life-green-strong)" strokeWidth={2.5} type="monotone" />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="nut-panel nut-panel--side">
          <div className="nut-section-head nut-section-head--compact">
            <div>
              <p className="nut-eyebrow">变化贡献</p>
              <h2>哪些因素推高或拉低评分</h2>
            </div>
          </div>
          <div className="nut-contrib">
            {contributions.map((item) => (
              <div className="nut-contrib__row" key={item.name}>
                <span>{item.name}</span>
                <div className="nut-contrib__track">
                  <i
                    style={{
                      background: item.color,
                      left: item.value >= 0 ? "50%" : `${50 + item.value * 11}%`,
                      width: `${Math.abs(item.value) * 11}%`
                    }}
                  />
                </div>
                <strong>{item.value > 0 ? "+" : ""}{item.value.toFixed(1)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="nut-panel nut-panel--wide">
          <div className="nut-section-head nut-section-head--compact">
            <div>
              <p className="nut-eyebrow">关键转折点</p>
              <h2>趋势变化不是每天都值得看，只标出转折</h2>
            </div>
          </div>
          <div className="nut-timeline">
            {rows.slice(-4).map((row, index) => (
              <div className="nut-timeline__event" key={row.period}>
                <span data-tone={index % 3 === 0 ? "bad" : "good"} />
                <strong>{row.period}</strong>
                <small>{index % 3 === 0 ? "超加工占比抬升" : index % 2 === 0 ? "蛋白质量改善" : "蔬果摄入增加"}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function CategoryDrilldown({ report }: { report: NutritionReport }) {
  const cats = (Object.keys(CATEGORY_LABELS) as NutritionCategory[])
    .map((cat) => ({ cat, items: report.topByCategory[cat] || [] }))
    .filter((group) => group.items.length > 0)
    .slice(0, 5);
  return (
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
              <span key={item.name}>{item.name}<small>{formatGrams(item.grams)}</small></span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function NutritionModule() {
  const months = useMemo(() => listMonths(6), []);
  const [period, setPeriod] = useState<string>(months[0]);
  const [activeTask, setActiveTask] = useState<NutritionTask>("today");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [trend, setTrend] = useState<TrendState>({ kind: "loading" });
  const [expenseMonth] = useState(currentMonth());
  const { analytics: expenseAnalytics, loadError: expenseLoadError, reload: loadExpenses } = useExpenseData(expenseMonth);
  const [expenseError, setExpenseError] = useState("");
  const [expenseMessage, setExpenseMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/nutrition/score?period=${encodeURIComponent(period)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as NutritionReport;
      })
      .then((report) => {
        if (!cancelled) setState({ kind: "ok", report });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    setTrend({ kind: "loading" });
    fetch("/api/nutrition/trend?months=6")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { months: TrendMonth[]; tracked: ReadonlyArray<NutritionCategory> };
      })
      .then((data) => {
        if (!cancelled) setTrend({ kind: "ok", months: data.months, tracked: data.tracked });
      })
      .catch((err: unknown) => {
        if (!cancelled) setTrend({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTaskChange = useCallback((task: NutritionTask) => {
    if (task === activeTask) return;
    runTaskTransition(() => setActiveTask(task));
  }, [activeTask]);

  async function uploadReceipt(formData: FormData) {
    setExpenseError("");
    setExpenseMessage("");
    const response = await fetch("/api/expenses/receipts", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    if (response.status === 409) {
      const existingId = (data as { existingReceiptId?: number }).existingReceiptId;
      setExpenseError(`已上传过这张图片${typeof existingId === "number" ? ` (receipt #${existingId})` : ""}，请到 /expenses/receipts 查看`);
      return;
    }
    if (!response.ok) {
      const failures = Array.isArray(data.failures)
        ? `; ${(data.failures as UploadFailure[]).map((f) => `${f.filename ?? "图片"}: ${f.error}`).join("; ")}`
        : "";
      setExpenseError(data.error ? `票据识别失败: ${data.error}${failures}` : "票据识别失败");
      return;
    }
    const receipts = (data.receipts ?? (data.receipt ? [data.receipt] : [])) as ExpenseReceiptSummary[];
    const failures = (data.failures ?? []) as UploadFailure[];
    const timings = (data.timings ?? []) as Array<{ filename?: string; provider?: string; model?: string; total_ms?: number; ocr_ms?: number }>;
    const jobsCount = Array.isArray(data.jobs) ? (data.jobs as unknown[]).length : 0;
    const summary = receipts.map((r) => `#${r.id} 已处理`).join(", ");
    const failureText = failures.length ? `; 失败 ${failures.length} 张: ${failures.map((f) => f.filename ?? "图片").join(", ")}` : "";
    const queuedText = jobsCount > 0 && receipts.length === 0 ? "; 图片已保存到识别队列，稍后自动重试" : "";
    setExpenseMessage(`${summary || "识别完成"}${failureText}${queuedText}${uploadTimingSummary(timings, data.total_ms)}`);
    await loadExpenses();
  }

  async function createManualExpense(input: ManualExpenseInput) {
    setExpenseError("");
    setExpenseMessage("");
    setManualBusy(true);
    try {
      const response = await fetch("/api/expenses/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setExpenseError(data.error ?? "手动支出保存失败");
        return;
      }
      setManualOpen(false);
      setExpenseMessage(`已记入: ${input.item_name} ${input.amount === null ? "-" : formatMoney(input.amount, input.currency ?? "CNY")}`);
      await loadExpenses();
    } finally {
      setManualBusy(false);
    }
  }

  return (
    <div className="life-os-nutrition">
      <ExpensesHeader
        kind="receipts"
        month={expenseMonth}
        uploader={{ onUpload: uploadReceipt }}
        manualExpense={{
          open: manualOpen,
          busy: manualBusy,
          onOpen: () => setManualOpen(true),
          onClose: () => setManualOpen(false),
          onSave: createManualExpense
        }}
        showBudgetSettings
        csvExport={{ month: expenseMonth, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai" }}
        onReload={loadExpenses}
      />
      <SubTabNav
        activeTab={activeTask}
        ariaLabel="营养子任务"
        idPrefix="nut-task-tab"
        onTabChange={handleTaskChange}
        tabs={TASKS}
      />
      {expenseError ? <div className="exp-banner exp-banner--error">{expenseError}</div> : null}
      {expenseLoadError ? (
        <div className="exp-banner exp-banner--error" role="alert">
          <span>
            {expenseLoadError.kind === "network"
              ? `支出网络问题: ${expenseLoadError.message}`
              : expenseLoadError.kind === "server"
                ? `支出服务器错误: ${expenseLoadError.message}`
                : `支出客户端错误: ${expenseLoadError.message}`}
          </span>
          <button className="exp-btn exp-btn--secondary exp-btn--sm" onClick={() => void loadExpenses()} type="button">重试</button>
        </div>
      ) : null}
      {expenseMessage ? <div className="exp-banner exp-banner--ok">{expenseMessage}</div> : null}
      {state.kind === "loading" ? (
        <LoadingState label="营养数据加载中..." />
      ) : state.kind === "error" ? (
        <ErrorState message={state.message} />
      ) : (
        <>
          {activeTask === "today" ? (
            <TodayView
              expenseAnalytics={expenseAnalytics}
              months={months}
              onPeriodChange={setPeriod}
              period={period}
              report={state.report}
            />
          ) : null}
          {activeTask === "structure" ? <StructureView expenseAnalytics={expenseAnalytics} report={state.report} /> : null}
          {activeTask === "trend" ? <TrendView report={state.report} trend={trend} /> : null}
          {activeTask === "structure" ? <CategoryDrilldown report={state.report} /> : null}
        </>
      )}
    </div>
  );
}
