"use client";

import { useCallback, useEffect, useState } from "react";

type Schedule = {
  id: number;
  supplement_name: string;
  brand: string | null;
  dose_text: string | null;
  time_of_day: string;
  days_of_week: string;
  active: number;
};

const timeLabels: Record<string, string> = {
  breakfast: "早餐后",
  lunch: "午餐后",
  dinner: "晚餐后",
  bedtime: "睡前"
};

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function defaultDays() {
  return [1, 2, 3, 4, 5, 6, 7];
}

export function SupplementScheduleClient() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [dose, setDose] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("breakfast");
  const [selectedDays, setSelectedDays] = useState<number[]>(defaultDays());

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/supplement-schedules");
    if (response.ok) {
      const data = await response.json();
      setSchedules(data.schedules ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function add() {
    if (!name.trim()) return;
    const response = await fetch("/api/supplement-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplement_name: name.trim(),
        brand: brand.trim() || undefined,
        dose_text: dose.trim() || undefined,
        time_of_day: timeOfDay,
        days_of_week: selectedDays
      })
    });
    if (response.ok) {
      setName("");
      setBrand("");
      setDose("");
      setTimeOfDay("breakfast");
      setSelectedDays(defaultDays());
      setShowForm(false);
      await load();
    }
  }

  async function toggleActive(schedule: Schedule) {
    await fetch(`/api/supplement-schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !schedule.active })
    });
    await load();
  }

  async function remove(id: number) {
    if (!window.confirm("确认删除这条补剂排班？")) return;
    await fetch(`/api/supplement-schedules/${id}`, { method: "DELETE" });
    await load();
  }

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    );
  }

  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="section-title">补剂排班</h2>
          <p className="mt-1 text-sm text-[#5d6963]">设定每日补剂计划，首页可一键确认记录。</p>
        </div>
        <button className="primary-action" onClick={() => setShowForm(true)} type="button">
          添加排班
        </button>
      </div>

      {showForm ? (
        <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50/80 p-4">
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="field">
                <label>补剂名称</label>
                <input className="control" onChange={(e) => setName(e.target.value)} placeholder="维生素 D3" value={name} />
              </div>
              <div className="field">
                <label>品牌（可选）</label>
                <input className="control" onChange={(e) => setBrand(e.target.value)} placeholder="Now" value={brand} />
              </div>
              <div className="field">
                <label>剂量（可选）</label>
                <input className="control" onChange={(e) => setDose(e.target.value)} placeholder="1000 IU" value={dose} />
              </div>
            </div>
            <div className="field">
              <div className="field-label">服用时间</div>
              <div className="segmented">
                {Object.entries(timeLabels).map(([value, label]) => (
                  <button
                    className="segment"
                    data-active={timeOfDay === value}
                    key={value}
                    onClick={() => setTimeOfDay(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <div className="field-label">重复日</div>
              <div className="segmented">
                {dayLabels.map((label, index) => (
                  <button
                    className="segment"
                    data-active={selectedDays.includes(index)}
                    key={index}
                    onClick={() => toggleDay(index)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="primary-action" onClick={() => void add()} type="button">
                保存
              </button>
              <button className="secondary-action" onClick={() => setShowForm(false)} type="button">
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#5d6963]">加载中...</p>
      ) : schedules.length === 0 ? (
        <p className="text-sm text-[#5d6963]">暂无补剂排班。</p>
      ) : (
        <div className="grid gap-2">
          {schedules.map((schedule) => {
            const days: number[] = JSON.parse(schedule.days_of_week || "[]");
            return (
              <div
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
                  schedule.active ? "border-[rgba(38,55,49,0.10)] bg-white/70" : "border-slate-200 bg-slate-50/50"
                }`}
                key={schedule.id}
              >
                <div className="flex-1">
                  <span className={`font-semibold ${schedule.active ? "text-[#17201c]" : "text-slate-400"}`}>
                    {schedule.supplement_name}
                  </span>
                  {schedule.dose_text ? <span className="ml-2 text-sm text-[#5d6963]">{schedule.dose_text}</span> : null}
                  {schedule.brand ? <span className="ml-2 text-xs text-[#5d6963]">({schedule.brand})</span> : null}
                  <div className="mt-1 text-xs text-[#5d6963]">
                    {timeLabels[schedule.time_of_day] ?? schedule.time_of_day}
                    <span className="mx-1">·</span>
                    {days.map((d) => `周${dayLabels[d]}`).join(" ")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                      schedule.active
                        ? "border-[rgba(38,55,49,0.10)] bg-white/70 text-[#45524c]"
                        : "border-teal-200 bg-teal-50 text-teal-700"
                    }`}
                    onClick={() => void toggleActive(schedule)}
                    type="button"
                  >
                    {schedule.active ? "暂停" : "启用"}
                  </button>
                  <button
                    className="rounded-md border border-red-200 bg-white/70 px-3 py-1 text-xs font-semibold text-red-600"
                    onClick={() => void remove(schedule.id)}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
