"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { summarizeRecord } from "@/lib/records/summary";
import type { RecordsPage, TimelineRecord } from "@/lib/records/types";

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

  async function deleteTimelineRecord(record: TimelineRecord) {
    const confirmed = window.confirm(`确认删除记录 #${record.id}？`);
    if (!confirmed) {
      return;
    }

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

      <div className="grid gap-3">
        {records.map((record) => (
          <article className="surface-card p-4" key={record.id}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm text-[#6b766f]">
              <time>{new Date(record.occurred_at).toLocaleString("zh-CN")}</time>
              <span>#{record.id}</span>
            </div>
            <p className="font-semibold leading-7 text-[#17201c]">{summarizeRecord(record)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                className="secondary-action"
                href={`/record?edit=${record.id}`}
              >
                编辑
              </Link>
              <button
                className="rounded-md border border-red-300 bg-white/70 px-3 py-2 text-sm font-semibold text-red-700"
                onClick={() => void deleteTimelineRecord(record)}
                type="button"
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>

      {!loading && records.length === 0 ? <p className="surface-card p-4 text-sm text-[#5d6963]">还没有记录。</p> : null}

      {cursor ? (
        <button
          className="secondary-action w-full"
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
