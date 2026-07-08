"use client";

import { useMemo, useState } from "react";

import type { ODTransactionRow } from "./od-day-drawer";
import "./od-home.css";

type Scope = "bills" | "health" | "all";

type Props = {
  month: string; // YYYY-MM
  rows: ReadonlyArray<ODTransactionRow>;
  onOpenDay: (dayIso: string) => void;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function monthBounds(month: string): { year: number; month: number; days: number; firstWeekday: number } {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  return {
    year: y,
    month: m,
    days: new Date(y, m, 0).getDate(),
    firstWeekday: new Date(y, m - 1, 1).getDay()
  };
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const SCOPE_LABELS: Record<Scope, string> = {
  bills: "账单",
  health: "健康记录",
  all: "全部"
};

/** Inline calendar card matching the OD reference. Shows the active
 *  month as a 7-column grid with per-day dots, a scope filter
 *  (账单 / 健康记录 / 全部), three inline stats, and the "展开月历"
 *  toggle. Day clicks bubble up via `onOpenDay` so the parent can
 *  mount the ODDayDrawer. */
export function ODCalendarCard({ month, rows, onOpenDay }: Props) {
  const [scope, setScope] = useState<Scope>("bills");
  const [expanded, setExpanded] = useState(false);

  const { year, month: mNum, days, firstWeekday } = useMemo(() => monthBounds(month), [month]);

  const visibleRows = useMemo(() => {
    if (scope === "all") return rows;
    if (scope === "bills") return rows.filter((r) => r.kind === "transaction" || r.kind === "receipt" || r.kind === "recurring");
    return [];
  }, [rows, scope]);

  const byDay = useMemo(() => {
    const map = new Map<string, ODTransactionRow[]>();
    for (const r of visibleRows) {
      const arr = map.get(r.day) ?? [];
      arr.push(r);
      map.set(r.day, arr);
    }
    return map;
  }, [visibleRows]);

  const today = todayIso();
  const monthPrefix = `${year}-${pad2(mNum)}`;

  const totalCount = visibleRows.length;
  const totalSpend = visibleRows.reduce(
    (acc, r) => acc + (typeof r.amount === "number" && !r.excluded ? r.amount : 0),
    0
  );
  const pendingCount = visibleRows.filter((r) => r.status === "pending" && !r.excluded).length;

  const cells: Array<{ key: string; day: number | null; iso?: string }> = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ key: `empty-${i}`, day: null });
  }
  for (let d = 1; d <= days; d += 1) {
    cells.push({ key: `d-${d}`, day: d, iso: `${monthPrefix}-${pad2(d)}` });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `pad-${cells.length}`, day: null });
  }

  return (
    <div className="od-card od-calendar-card">
      <div className="od-calendar-head">
        <div className="od-calendar-title">
          {year} 年 {mNum} 月
        </div>
        <div className="od-calendar-scope" role="tablist">
          {(["bills", "health", "all"] as Scope[]).map((s) => (
            <button
              aria-selected={scope === s}
              className={`od-cal-scope-tab${scope === s ? " is-active" : ""}`}
              key={s}
              onClick={() => setScope(s)}
              role="tab"
              type="button"
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="od-cal-stats">
          <span className="od-cal-stat pending" title="待处理条目">
            <b>{pendingCount}</b>
            <i>待处理</i>
          </span>
          <span className="od-cal-stat" title="本月事件数">
            <b>{totalCount}</b>
            <i>项</i>
          </span>
          <span className="od-cal-stat" title="本月支出">
            <b>¥{totalSpend.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          </span>
        </div>
        <div className="od-card-actions">
          <button
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
            type="button"
          >
            {expanded ? "收起月历" : "展开月历"}
          </button>
        </div>
      </div>
      <div className="od-calendar" role="grid" aria-label={`${year} 年 ${mNum} 月 日历`}>
        {WEEKDAYS.map((w) => (
          <div className="od-calendar-day-hdr" key={w} role="columnheader">
            {w}
          </div>
        ))}
        {cells.map((cell) => {
          if (cell.day === null || !cell.iso) {
            return <div className="od-calendar-cell empty" key={cell.key} />;
          }
          const rowsForDay = byDay.get(cell.iso) ?? [];
          const isToday = cell.iso === today;
          const classes = [
            "od-calendar-cell",
            isToday ? "today" : ""
          ]
            .filter(Boolean)
            .join(" ");
          const topLabel = rowsForDay[0]?.title ?? "";
          const dotClass = rowsForDay.some((r) => r.kind === "transaction")
            ? "health"
            : rowsForDay.length > 0
              ? ""
              : "";
          return (
            <button
              aria-label={`${cell.iso} ${rowsForDay.length} 项`}
              className={classes}
              key={cell.key}
              onClick={() => onOpenDay(cell.iso!)}
              type="button"
            >
              <span className="day-num">{cell.day}</span>
              {topLabel ? (
                <span className="day-tx">
                  {topLabel.length > 6 ? `${topLabel.slice(0, 6)}…` : topLabel}
                </span>
              ) : null}
              {rowsForDay.length > 0 ? <span className={`dot ${dotClass}`} /> : null}
            </button>
          );
        })}
      </div>
      {expanded ? (
        <div className="od-calendar-expanded">
          <strong>完整月历视图</strong> — 31 天逐日营养 / 支出 / 睡眠 / 习惯打点。点击日期进入日视图。日历视图包括周视图切换与导出 iCal。
        </div>
      ) : null}
    </div>
  );
}
