"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { summarizeRecord } from "@/lib/records/summary";
import type { RecordsPage, RecordType, TimelineRecord } from "@/lib/records/types";

const typeConfig: Record<RecordType, { label: string; accent: string; border: string; bg: string }> = {
  meal: { label: "餐食", accent: "bg-teal-700", border: "border-l-teal-700", bg: "bg-teal-50" },
  supplement: { label: "补剂", accent: "bg-emerald-600", border: "border-l-emerald-600", bg: "bg-emerald-50" },
  post_meal_symptom: { label: "餐后反应", accent: "bg-amber-500", border: "border-l-amber-500", bg: "bg-amber-50" },
  bowel: { label: "排便", accent: "bg-cyan-700", border: "border-l-cyan-700", bg: "bg-cyan-50" },
  water: { label: "饮水", accent: "bg-sky-500", border: "border-l-sky-500", bg: "bg-sky-50" },
  nosebleed: { label: "流鼻血", accent: "bg-rose-400", border: "border-l-rose-400", bg: "bg-rose-50" },
  daily_summary: { label: "睡前总结", accent: "bg-indigo-500", border: "border-l-indigo-500", bg: "bg-indigo-50" },
  sleep: { label: "睡眠", accent: "bg-slate-500", border: "border-l-slate-500", bg: "bg-slate-50" }
};

function dateGroupKey(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function groupLabel(dateKey: string) {
  const today = dateGroupKey(new Date().toISOString());
  const yesterday = dateGroupKey(new Date(Date.now() - 86400000).toISOString());
  if (dateKey === today) return "今天";
  if (dateKey === yesterday) return "昨天";
  const d = new Date(dateKey + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function TimelineClient() {
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextCursor?: string | null) {
    setLoading(true);
    setError("");
    const url = `/api/records?limit=30${nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ""}`;
    const response = await fetch(url);
    if (!response.ok) {
      setError("时间线加载失败");
      setLoading(false);
      return;
    }
    const data = (await response.json()) as RecordsPage;
    setRecords((current) => (nextCursor ? [...current, ...data.records] : data.records));
    setCursor(data.nextCursor);
    setLoading(false);
  }

  async function deleteRecord(record: TimelineRecord) {
    const confirmed = window.confirm(`确认删除这条${typeConfig[record.type]?.label ?? ""}记录 #${record.id}？`);
    if (!confirmed) return;
    setError("");
    const response = await fetch(`/api/records/${record.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "删除失败");
      return;
    }
    setRecords((current) => current.filter((item) => item.id !== record.id));
  }

  useEffect(() => {
    load(null).catch(() => setError("时间线加载失败"));
  }, []);

  const groups: { dateKey: string; records: TimelineRecord[] }[] = [];
  for (const record of records) {
    const key = dateGroupKey(record.occurred_at);
    const last = groups[groups.length - 1];
    if (last && last.dateKey === key) {
      last.records.push(record);
    } else {
      groups.push({ dateKey: key, records: [record] });
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-teal-800">Raw Feed</p>
          <h1 className="mt-2 text-[32px] font-bold leading-tight text-[#17201c]">Timeline</h1>
          <p className="mt-1 text-sm text-[#5d6963]">按发生时间倒序展示原始记录。</p>
        </div>
        <Link className="primary-action" href="/record">
          Add Record
        </Link>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-6">
        {groups.map((group) => (
          <section key={group.dateKey}>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm font-bold text-[#17201c]">{groupLabel(group.dateKey)}</span>
              <span className="h-px flex-1 bg-[rgba(38,55,49,0.08)]" />
              <span className="text-xs text-[#6b766f]">{group.dateKey}</span>
            </div>
            <div className="grid gap-2">
              {group.records.map((record) => {
                const config = typeConfig[record.type];
                return (
                  <article
                    className="surface-card overflow-hidden transition hover:shadow-md"
                    key={record.id}
                  >
                    <div className="flex">
                      <div className={`w-1 shrink-0 ${config?.border ?? "border-l-slate-300"} border-l-4`} />
                      <div className="flex flex-1 flex-col gap-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${config?.bg ?? "bg-slate-100"} ${config?.accent?.replace("bg-", "text-") ?? "text-slate-700"}`}>
                              {config?.label ?? record.type}
                            </span>
                            <time className="text-xs text-[#6b766f]">
                              {new Date(record.occurred_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                            </time>
                          </div>
                          <span className="text-xs text-[#9ca8a0]">#{record.id}</span>
                        </div>
                        <p className="text-sm leading-6 text-[#17201c]">{summarizeRecord(record)}</p>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="rounded-md border border-[rgba(38,55,49,0.10)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#45524c] transition hover:bg-white"
                            href={`/record?edit=${record.id}`}
                          >
                            编辑
                          </Link>
                          <button
                            className="rounded-md border border-red-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                            onClick={() => void deleteRecord(record)}
                            type="button"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {!loading && records.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 p-8 text-center">
          <span className="text-3xl">📋</span>
          <p className="text-sm text-[#5d6963]">还没有记录。</p>
          <Link className="primary-action mt-2" href="/record">
            开始记录
          </Link>
        </div>
      ) : null}

      {cursor ? (
        <button
          className="secondary-action w-full transition hover:bg-white"
          disabled={loading}
          onClick={() => load(cursor)}
          type="button"
        >
          {loading ? "加载中..." : "加载更早记录"}
        </button>
      ) : null}
    </div>
  );
}
