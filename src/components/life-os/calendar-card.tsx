"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react";

import "./life-os.css";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Props = {
  /** Override the reference date (defaults to today). Useful for testing. */
  referenceDate?: Date;
  /** ISO date strings ("YYYY-MM-DD") that have spending activity. */
  activeDays?: ReadonlyArray<string>;
};

export function CalendarCard({ referenceDate, activeDays = [] }: Props) {
  const [expanded, setExpanded] = useState(false);
  const ref = referenceDate ?? new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const todayKey = iso(ref);
  const activeSet = new Set(activeDays);

  const monthLabel = `${year} 年 ${month + 1} 月`;

  // Full month cells.
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const fullCells: Array<{ key: string; label: number | null; muted?: boolean }> = [];
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    fullCells.push({ key: `prev-${i}`, label: prevMonthDays - i, muted: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    fullCells.push({ key: iso(new Date(year, month, d)), label: d });
  }
  while (fullCells.length % 7 !== 0) {
    fullCells.push({
      key: `next-${fullCells.length}`,
      label: fullCells.length - daysInMonth - firstWeekday + 1,
      muted: true
    });
  }
  while (fullCells.length < 42) {
    fullCells.push({
      key: `next-${fullCells.length}`,
      label: fullCells.length - daysInMonth - firstWeekday + 1,
      muted: true
    });
  }

  // Week view: the 7-day window that contains today.
  const todayIndex = fullCells.findIndex((cell) => cell.key === todayKey);
  const weekStartIndex = todayIndex >= 0 ? Math.floor(todayIndex / 7) * 7 : 0;
  const weekCells = fullCells.slice(weekStartIndex, weekStartIndex + 7);

  const cells = expanded ? fullCells : weekCells;

  function renderCell(cell: (typeof cells)[number]) {
    if (cell.label === null) return <div key={cell.key} className="life-calendar__cell" />;
    const isToday = cell.key === todayKey;
    const hasData = !cell.muted && activeSet.has(cell.key);
    const classes = [
      "life-calendar__cell",
      cell.muted ? "life-calendar__cell--muted" : "",
      isToday ? "life-calendar__cell--today" : "",
      hasData ? "life-calendar__cell--has-data" : ""
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <div key={cell.key} className={classes} role="gridcell">
        {cell.label}
      </div>
    );
  }

  return (
    <section className="life-card life-calendar-card">
      <header className="life-card__header">
        <span className="life-card__title">
          <CalendarDays strokeWidth={2} style={{ width: 15, height: 15 }} aria-hidden />
          日历
        </span>
        <span className="life-calendar-card__month">{monthLabel}</span>
      </header>
      <div
        className="life-calendar"
        role="grid"
        aria-label={`${monthLabel} 日历`}
        data-week-view={!expanded}
      >
        {WEEKDAYS.map((w) => (
          <div key={`hdr-${w}`} className="life-calendar__cell life-calendar__cell--header" role="columnheader">
            {w}
          </div>
        ))}
        {cells.map((cell) => renderCell(cell))}
      </div>
      <button
        className="life-calendar-card__toggle"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        {expanded ? (
          <>
            收起月历 <ChevronUp strokeWidth={2} style={{ width: 14, height: 14 }} />
          </>
        ) : (
          <>
            展开月历 <ChevronDown strokeWidth={2} style={{ width: 14, height: 14 }} />
          </>
        )}
      </button>
    </section>
  );
}
