"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { summarizeRecord } from "@/lib/records/summary";
import type { RecordsPage, RecordType, TimelineRecord } from "@/lib/records/types";

const quickCapture: { type: RecordType; label: string; description: string; accent: string }[] = [
  { type: "meal", label: "Meal", description: "餐食", accent: "bg-teal-700" },
  { type: "supplement", label: "Supplement", description: "补剂", accent: "bg-emerald-600" },
  { type: "post_meal_symptom", label: "Post-meal", description: "餐后反应", accent: "bg-amber-500" },
  { type: "bowel", label: "Bowel", description: "排便", accent: "bg-cyan-700" },
  { type: "water", label: "Water", description: "饮水", accent: "bg-sky-500" },
  { type: "nosebleed", label: "Nosebleed", description: "流鼻血", accent: "bg-rose-400" },
  { type: "daily_summary", label: "Summary", description: "睡前总结", accent: "bg-indigo-500" },
  { type: "sleep", label: "Sleep", description: "睡眠", accent: "bg-slate-500" }
];

function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return localDateKey(new Date().toISOString());
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function numberPayload(value: unknown) {
  return typeof value === "number" ? value : 0;
}

export function TodayDashboardClient() {
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/records?limit=100")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Today records failed to load");
        }
        const data = (await response.json()) as RecordsPage;
        setRecords(data.records ?? []);
      })
      .catch(() => setError("今日记录加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const today = todayKey();
  const todayRecords = useMemo(() => records.filter((record) => localDateKey(record.occurred_at) === today), [records, today]);
  const waterTotal = todayRecords
    .filter((record) => record.type === "water")
    .reduce((total, record) => total + numberPayload(record.payload.amount_ml), 0);
  const lastRecord = todayRecords[0] ?? records[0] ?? null;
  const hasDailySummary = todayRecords.some(
    (record) => record.type === "daily_summary" || record.payload.summary_date === today
  );
  const hasSleep = todayRecords.some((record) => record.type === "sleep" || record.payload.sleep_date === today);
  const recentPreview = records.slice(0, 5);

  return (
    <div className="grid gap-8">
      <section className="surface-card p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-800">Record Layer</p>
            <h1 className="mt-3 text-[32px] font-bold leading-tight text-[#17201c]">Today</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#5d6963]">
              今日只展示已记录的原始事实和简单计数。Insights、Trends 和 Decisions 当前保留为空状态。
            </p>
          </div>
          <Link className="primary-action" href="/record">
            Open Capture
          </Link>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <FactTile label="今日记录数" value={loading ? "..." : String(todayRecords.length)} />
          <FactTile label="今日饮水总量" value={loading ? "..." : `${waterTotal} ml`} />
          <FactTile label="最近一次记录" value={lastRecord ? `${timeLabel(lastRecord.occurred_at)} ${lastRecord.type}` : "暂无记录"} />
        </div>
      </section>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Quick Capture</h2>
            <p className="mt-1 text-sm text-[#5d6963]">What happened?</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickCapture.map((item) => (
            <Link className="surface-card group flex min-h-24 flex-col justify-between p-4" href={`/record?type=${item.type}`} key={item.type}>
              <span className={`h-2 w-10 rounded-full ${item.accent}`} />
              <span>
                <span className="block text-base font-bold text-[#17201c]">{item.label}</span>
                <span className="mt-1 block text-sm text-[#5d6963]">{item.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-card p-5">
          <h2 className="section-title">Recent Records</h2>
          <div className="mt-4 grid gap-3">
            {recentPreview.map((record) => (
              <article className="rounded-lg border border-[rgba(38,55,49,0.10)] bg-white/70 p-3" key={record.id}>
                <div className="mb-1 flex items-center justify-between text-xs text-[#6b766f]">
                  <time>{new Date(record.occurred_at).toLocaleString("zh-CN")}</time>
                  <span>#{record.id}</span>
                </div>
                <p className="text-sm font-semibold leading-6 text-[#17201c]">{summarizeRecord(record)}</p>
              </article>
            ))}
            {!loading && recentPreview.length === 0 ? <p className="text-sm text-[#5d6963]">暂无记录。</p> : null}
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="section-title">Today Summary</h2>
          <div className="mt-4 grid gap-3">
            <StatusRow label="睡前总结" value={hasDailySummary ? "已记录" : "未记录"} />
            <StatusRow label="睡眠记录" value={hasSleep ? "已记录" : "未记录"} />
            <StatusRow label="最近记录预览" value={lastRecord ? summarizeRecord(lastRecord) : "暂无记录"} />
          </div>
        </div>
      </section>
    </div>
  );
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgba(38,55,49,0.10)] bg-white/65 p-4">
      <p className="text-xs font-semibold text-[#6b766f]">{label}</p>
      <p className="mt-2 text-lg font-bold text-[#17201c]">{value}</p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-[rgba(38,55,49,0.10)] bg-white/60 p-3">
      <span className="text-xs font-semibold text-[#6b766f]">{label}</span>
      <span className="text-sm font-semibold leading-6 text-[#17201c]">{value}</span>
    </div>
  );
}
