"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePendingMealReactions } from "@/hooks/use-pending-meal-reactions";
import { usePendingSupplements } from "@/hooks/use-pending-supplements";
import { summarizeRecord } from "@/lib/records/summary";
import type { RecordsPage, RecordType, TimelineRecord } from "@/lib/records/types";

const timeLabels: Record<string, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  bedtime: "睡前"
};

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
  if (Number.isNaN(date.getTime())) return "";
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/records?limit=100");
      if (!response.ok) throw new Error("Failed to load");
      const data = (await response.json()) as RecordsPage;
      setRecords(data.records ?? []);
    } catch {
      setError("今日记录加载失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => setError("今日记录加载失败"));
  }, [load]);

  const today = todayKey();
  const hour = new Date().getHours();
  const todayRecords = useMemo(
    () => records.filter((record) => localDateKey(record.occurred_at) === today),
    [records, today]
  );

  const waterTotal = todayRecords
    .filter((record) => record.type === "water")
    .reduce((total, record) => total + numberPayload(record.payload.amount_ml), 0);

  const lastRecord = todayRecords[0] ?? records[0] ?? null;
  const recentPreview = records.slice(0, 5);

  const hasDailySummary = todayRecords.some((record) => record.type === "daily_summary");
  const hasSleep = todayRecords.some((record) => record.type === "sleep");
  const hasMeal = todayRecords.some((record) => record.type === "meal");
  const hasBowel = todayRecords.some((record) => record.type === "bowel");

  const pendingReactions = usePendingMealReactions(records);
  const { pending: pendingSupplements, loading: suppLoading, reload: reloadSupp } = usePendingSupplements(todayRecords);

  async function confirmSupplement(supplement: { scheduleId: number; supplementName: string; brand: string | null; doseText: string | null }) {
    await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "supplement",
        occurred_at: new Date().toISOString(),
        payload: {
          supplement_name: supplement.supplementName,
          brand: supplement.brand ?? undefined,
          dose_text: supplement.doseText ?? undefined
        }
      })
    });
    await load();
    await reloadSupp();
  }

  async function confirmAllSupplements() {
    for (const supp of pendingSupplements) {
      await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "supplement",
          occurred_at: new Date().toISOString(),
          payload: {
            supplement_name: supp.supplementName,
            brand: supp.brand ?? undefined,
            dose_text: supp.doseText ?? undefined
          }
        })
      });
    }
    await load();
    await reloadSupp();
  }

  return (
    <div className="grid gap-8">
      <section className="surface-card p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-800">Record Layer</p>
            <h1 className="mt-3 text-[32px] font-bold leading-tight text-[#17201c]">Today</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#5d6963]">
              今日展示原始事实和简单计数。Insights 和 Trends 会基于已有记录生成第一版分析，Decisions 仍保留为空状态。
            </p>
          </div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <FactTile label="今日记录数" value={loading ? "..." : String(todayRecords.length)} />
          <FactTile label="今日饮水总量" value={loading ? "..." : `${waterTotal} ml`} />
          <FactTile label="最近一次记录" value={lastRecord ? `${timeLabel(lastRecord.occurred_at)} ${lastRecord.type}` : "暂无记录"} />
        </div>
      </section>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      {/* Reminders section */}
      {!loading ? (
        <section className="grid gap-3">
          <h2 className="section-title">Reminders</h2>
          {/* Post-meal reaction reminders */}
          {pendingReactions.length > 0 ? (
            <div className="surface-card p-4">
              <h3 className="text-sm font-semibold text-[#17201c]">待记录餐后反应</h3>
              <div className="mt-3 grid gap-2">
                {pendingReactions.map((reaction) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3"
                    key={reaction.mealId}
                  >
                    <div className="flex-1">
                      <span className="text-sm font-medium">{reaction.summary}</span>
                      <span className="ml-2 text-xs text-[#5d6963]">
                        {reaction.isReady ? "🟢 可记录" : `🕐 ${Math.ceil((reaction.readyAt.getTime() - Date.now()) / 60000)} 分钟后`}
                      </span>
                    </div>
                    <Link
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                        reaction.isReady
                          ? "bg-amber-500 text-white"
                          : "border border-[rgba(38,55,49,0.10)] bg-white/70 text-[#45524c] pointer-events-none opacity-50"
                      }`}
                      href={`/record?type=post_meal_symptom`}
                    >
                      记录反应
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Sleep summary reminder */}
          {hour >= 20 && !hasDailySummary ? (
            <div className="surface-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-medium">睡前总结未记录</span>
                  <span className="ml-2 text-xs text-[#5d6963]">提醒你记录今天的皮肤和鼻部状态</span>
                </div>
                <Link className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white" href="/record?type=daily_summary">
                  去记录
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Pending supplements */}
      {!loading && !suppLoading && pendingSupplements.length > 0 ? (
        <section className="surface-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="section-title">今日待补剂</h2>
            <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => void confirmAllSupplements()} type="button">
              全部确认
            </button>
          </div>
          <div className="grid gap-2">
            {pendingSupplements.map((supp) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(38,55,49,0.10)] bg-white/60 p-3"
                key={supp.scheduleId}
              >
                <div className="flex-1">
                  <span className="text-sm font-semibold text-[#17201c]">{supp.supplementName}</span>
                  {supp.doseText ? <span className="ml-2 text-xs text-[#5d6963]">{supp.doseText}</span> : null}
                  {supp.brand ? <span className="ml-1 text-xs text-[#5d6963]">({supp.brand})</span> : null}
                  <span className="ml-2 text-xs text-[#5d6963]">{timeLabels[supp.timeOfDay] ?? supp.timeOfDay}</span>
                </div>
                <button
                  className="rounded-md border border-[rgba(38,55,49,0.10)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#45524c]"
                  onClick={() => void confirmSupplement(supp)}
                  type="button"
                >
                  已服用
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
          <h2 className="section-title">Today Checklist</h2>
          <div className="mt-4 grid gap-3">
            <StatusRow label="餐食" done={hasMeal} />
            <StatusRow label="排便" done={hasBowel} />
            <StatusRow label="睡前总结" done={hasDailySummary} />
            <StatusRow label="睡眠记录" done={hasSleep} />
            <StatusRow label="补剂" done={!suppLoading && pendingSupplements.length === 0} />
            {lastRecord ? (
              <div className="mt-2 rounded-lg border border-[rgba(38,55,49,0.10)] bg-white/60 p-3">
                <span className="text-xs font-semibold text-[#6b766f]">最近记录</span>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#17201c]">{summarizeRecord(lastRecord)}</p>
              </div>
            ) : null}
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

function StatusRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(38,55,49,0.10)] bg-white/60 p-3">
      <span className="text-xs font-semibold text-[#6b766f]">{label}</span>
      <span className={`text-xs font-bold ${done ? "text-teal-700" : "text-slate-400"}`}>
        {done ? "✅ 已记录" : "⬜ 未记录"}
      </span>
    </div>
  );
}
