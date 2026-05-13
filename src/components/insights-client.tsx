"use client";

import { useEffect, useState } from "react";

import type { DataQuality, InsightCard, MealReactionMetric } from "@/lib/analysis/types";

type InsightsResponse = {
  date_range: {
    start: string;
    end: string;
    range_days: number;
  };
  data_quality: DataQuality;
  insights: InsightCard[];
  meal_reactions: MealReactionMetric[];
  generated_at: string;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function severityClass(severity: InsightCard["severity"]) {
  if (severity === "attention") {
    return "border-rose-200 bg-rose-50/80 text-rose-950";
  }
  if (severity === "watch") {
    return "border-amber-200 bg-amber-50/80 text-amber-950";
  }
  return "border-[rgba(38,55,49,0.10)] bg-white/70 text-[#17201c]";
}

export function InsightsClient() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [rangeDays, setRangeDays] = useState("28");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/insights?range_days=${rangeDays}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Insights failed to load");
        }
        setData((await response.json()) as InsightsResponse);
      })
      .catch(() => setError("Insights 加载失败"))
      .finally(() => setLoading(false));
  }, [rangeDays]);

  const quality = data?.data_quality;

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-teal-800">Analysis Layer</p>
          <h1 className="mt-2 text-[32px] font-bold leading-tight text-[#17201c]">Insights</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5d6963]">
            当前只展示数据质量、趋势和餐后短期反应观察；不做诊断，也不输出确定触发因素。
          </p>
        </div>
        <select className="control max-w-40" onChange={(event) => setRangeDays(event.target.value)} value={rangeDays}>
          <option value="14">14 天</option>
          <option value="28">28 天</option>
          <option value="56">56 天</option>
          <option value="84">84 天</option>
        </select>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div> : null}
      {loading ? <p className="surface-card p-4 text-sm text-[#5d6963]">正在计算...</p> : null}

      {quality ? (
        <section className="surface-card p-5">
          <h2 className="section-title">Data Quality</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricTile label="有记录天数" value={`${quality.recording_days}/${quality.range_days}`} />
            <MetricTile label="睡前总结覆盖" value={percent(quality.daily_summary_coverage)} />
            <MetricTile label="睡眠覆盖" value={percent(quality.sleep_coverage)} />
            <MetricTile label="餐食覆盖" value={percent(quality.meal_coverage)} />
            <MetricTile label="排便覆盖" value={percent(quality.bowel_coverage)} />
            <MetricTile label="餐后反应覆盖" value={percent(quality.post_meal_symptom_coverage)} />
          </div>
        </section>
      ) : null}

      {data ? (
        <section className="grid gap-3">
          <h2 className="section-title">Insight Cards</h2>
          {data.insights.map((insight) => (
            <article className={`rounded-lg border p-4 ${severityClass(insight.severity)}`} key={insight.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold">{insight.title}</h3>
                <span className="rounded-md border border-current/20 px-2 py-1 text-xs font-bold">{insight.support_level}</span>
              </div>
              <p className="mt-2 text-sm leading-6">{insight.summary}</p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold">查看证据</summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-white/70 p-3 text-xs leading-5 text-[#293744]">
                  {JSON.stringify(insight.evidence, null, 2)}
                </pre>
              </details>
            </article>
          ))}
          {data.insights.length === 0 ? <p className="surface-card p-4 text-sm text-[#5d6963]">当前还没有 insight。</p> : null}
        </section>
      ) : null}

      {data ? (
        <section className="surface-card p-5">
          <h2 className="section-title">Meal Reaction Watchlist</h2>
          <div className="mt-4 grid gap-3">
            {data.meal_reactions.map((reaction) => (
              <div className="rounded-lg border border-[rgba(38,55,49,0.10)] bg-white/65 p-3" key={reaction.key}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#17201c]">{reaction.label}</span>
                  <span className="text-sm text-[#5d6963]">样本 {reaction.exposed_count}</span>
                </div>
                <p className="mt-1 text-sm text-[#5d6963]">
                  暴露均值 {reaction.exposed_bloating_avg?.toFixed(1) ?? "无"}，其他餐均值{" "}
                  {reaction.unexposed_bloating_avg?.toFixed(1) ?? "无"}，差值 {reaction.delta?.toFixed(1) ?? "无"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgba(38,55,49,0.10)] bg-white/65 p-4">
      <p className="text-xs font-semibold text-[#6b766f]">{label}</p>
      <p className="mt-2 text-lg font-bold text-[#17201c]">{value}</p>
    </div>
  );
}
