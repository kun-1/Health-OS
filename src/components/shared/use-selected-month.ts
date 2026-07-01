"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { currentMonth } from "@/components/expenses/shared/task-helpers";

export const MONTH_PATTERN = /^\d{4}-\d{2}$/;
export const SELECTED_MONTH_STORAGE_KEY = "health-monitor:selected-month";

function readStoredMonth(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(SELECTED_MONTH_STORAGE_KEY);
    return value && MONTH_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Read the currently selected month.
 *
 * Priority:
 *   1. URL `?month=YYYY-MM` (shareable / bookmarkable)
 *   2. localStorage last selected month (survives navigation)
 *   3. Actual current month
 *
 * Centralized so home, nutrition, and the expense sub-pages read the same
 * value. The MonthSwitcher writes to both the URL and localStorage.
 *
 * localStorage is read inside useEffect to avoid hydration mismatches: the
 * server and the initial client render both fall back to the current month
 * when the URL has no month param, then sync to the stored value after
 * hydration.
 */
export function useSelectedMonth(): string {
  const searchParams = useSearchParams();
  const param = searchParams?.get("month") ?? null;
  const urlMonth = param && MONTH_PATTERN.test(param) ? param : null;

  const [storedMonth, setStoredMonth] = useState<string | null>(null);

  useEffect(() => {
    setStoredMonth(readStoredMonth());
  }, []);

  if (urlMonth) return urlMonth;
  return storedMonth ?? currentMonth();
}
