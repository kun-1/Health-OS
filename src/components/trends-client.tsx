"use client";

import { useEffect, useState } from "react";

import type { DailyMetric, TrendSummary } from "@/lib/analysis/types";

type TrendsResponse = {
  date_range: {
    start: string;
    end: string;
    range_days: number;
  };
  trend_summaries: TrendSummary[];
  daily_metrics: DailyMetric[];
  generated_at: string;
};

function formatNumber(value: number | null, unit: string) {
  if (value === null || !Number.isFinite(value)) {
    return "无数据";
  }
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text}${unit}`;
}

function directionText(direction: TrendSummary["direction"]) {
  if (direction === "up") return "上升";
  if (direction === "down") return "下降";
  if (direction === "flat") return "持平";
  return "未知";
}

function maxPoint(summary: TrendSummary) {
  const values = summary.points.map((point) => point.value).filter((value): value is number => typeof value === "number");
  return values.length ? Math.max(...values, 1) : 1;
}

export function TrendsClient() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [rangeDays, setRangeDays] = useState("28");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/trends?range_days=${rangeDays}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Trends failed to load");
        }
        setData((await response.json()) as TrendsResponse);
      })
      .catch(() => setError("Trends 加载失败"))
      .finally(() => setLoading(false));
  }, [rangeDays]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-teal-800">Structured Trends</p>
          <h1 className="mt-2 text-[32px] font-bold leading-tight text-[#17201c]">Trends</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5d6963]">
            以最近 7 天和前 7 天对比为主，空值代表没有记录，不会被当作 0。
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

      {data ? (
        <section className="grid gap-4 sm:grid-cols-2">
          {data.trend_summaries.map((summary) => (
            <article className="surface-card p-5" key={String(summary.metric_key)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#17201c]">{summary.label}</h2>
                  <p className="mt-1 text-sm text-[#5d6963]">趋势：{directionText(summary.direction)}</p>
                </div>
                <div className="text-right text-sm text-[#5d6963]">
                  <p>近 7 天 {formatNumber(summary.current_avg, summary.unit)}</p>
                  <p>前 7 天 {formatNumber(summary.previous_avg, summary.unit)}</p>
                </div>
              </div>
              <TrendBars summary={summary} />
            </article>
          ))}
        </section>
      ) : null}

      {data ? (
        <section className="surface-card p-5">
          <h2 className="section-title">Daily Metrics</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs text-[#6b766f]">
                <tr>
                  <th className="px-3 py-2">日期</th>
                  <th className="px-3 py-2">皮肤</th>
                  <th className="px-3 py-2">鼻塞</th>
                  <th className="px-3 py-2">睡眠</th>
                  <th className="px-3 py-2">压力</th>
                  <th className="px-3 py-2">饮水</th>
                  <th className="px-3 py-2">Bristol</th>
                  <th className="px-3 py-2">记录数</th>
                </tr>
              </thead>
              <tbody>
                {data.daily_metrics
                  .slice()
                  .reverse()
                  .map((metric) => (
                    <tr className="bg-white/65" key={metric.date}>
                      <td className="rounded-l-lg px-3 py-2 font-semibold text-[#17201c]">{metric.date}</td>
                      <td className="px-3 py-2">{metric.skin_core_score ?? "未记录"}</td>
                      <td className="px-3 py-2">{metric.nasal_core_score ?? "未记录"}</td>
                      <td className="px-3 py-2">{metric.sleep_quality ?? "未记录"}</td>
                      <td className="px-3 py-2">{metric.day_stress_peak ?? "未记录"}</td>
                      <td className="px-3 py-2">{metric.water_total_ml === null ? "未记录" : `${metric.water_total_ml} ml`}</td>
                      <td className="px-3 py-2">{metric.bristol_median ?? "未记录"}</td>
                      <td className="rounded-r-lg px-3 py-2">{metric.record_count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TrendBars({ summary }: { summary: TrendSummary }) {
  const max = maxPoint(summary);

  return (
    <div className="mt-5 grid grid-cols-7 gap-1">
      {summary.points.slice(-14).map((point) => {
        const height = point.value === null ? 4 : Math.max(8, Math.round((point.value / max) * 72));
        return (
          <div className="grid h-24 items-end gap-1" key={point.date} title={`${point.date}: ${point.value ?? "无数据"}`}>
            <div
              className={point.value === null ? "rounded bg-slate-200" : "rounded bg-teal-600"}
              style={{ height: `${height}px` }}
            />
            <span className="truncate text-center text-[10px] text-[#6b766f]">{point.date.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}
