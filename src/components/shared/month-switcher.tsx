"use client";

/**
 * MonthSwitcher — prev / current / next buttons that update the URL's
 * `?month=YYYY-MM` query param and persist the choice to localStorage.
 *
 * The page's data layer reads the same param (via useSearchParams), so
 * the entire dashboard re-fetches when the month changes. When the user
 * navigates to a page without a month param, useSelectedMonth falls back
 * to the stored value, keeping the selected month global across pages.
 *
 * Range is unbounded but practical usage is the past 12 months +
 * current month. Pushing past month 12 lands on year -1 (e.g. 2025-07).
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { SELECTED_MONTH_STORAGE_KEY } from "./use-selected-month";

import "./month-switcher.css";

type Props = {
  /** Current displayed month in YYYY-MM format. Defaults to the URL's
   *  `?month=` query, falling back to today's month. */
  month: string;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function shiftMonth(current: string, delta: number): string {
  const [yStr, mStr] = current.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return current;
  const absolute = y * 12 + (m - 1) + delta;
  const newY = Math.floor(absolute / 12);
  const newM = (absolute % 12) + 12 * 0 + 1;
  return `${newY}-${pad(((newM - 1) % 12) + 1)}`;
}

function formatLabel(month: string): string {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return month;
  return `${y} 年 ${m} 月`;
}

export function MonthSwitcher({ month }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(next: string) {
    try {
      window.localStorage.setItem(SELECTED_MONTH_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="month-switcher" role="group" aria-label="月份切换">
      <button
        type="button"
        className="month-switcher__btn"
        onClick={() => navigate(prev)}
        aria-label={`上一月（${formatLabel(prev)}）`}
        title="上一月"
      >
        <ChevronLeft strokeWidth={2} />
      </button>
      <label className="month-switcher__label" title="点击选择月份">
        <input
          aria-label="选择月份"
          className="month-switcher__input"
          onChange={(event) => navigate(event.target.value)}
          type="month"
          value={month}
        />
        {formatLabel(month)}
      </label>
      <button
        type="button"
        className="month-switcher__btn"
        onClick={() => navigate(next)}
        aria-label={`下一月（${formatLabel(next)}）`}
        title="下一月"
      >
        <ChevronRight strokeWidth={2} />
      </button>
    </div>
  );
}