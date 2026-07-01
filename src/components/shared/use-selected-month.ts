"use client";

import { useSearchParams } from "next/navigation";

import { currentMonth } from "@/components/expenses/shared/task-helpers";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Read the currently selected month from the URL's `?month=YYYY-MM`
 * query param, falling back to the actual current month when the
 * param is absent or malformed. Centralized so the four pages
 * (home, nutrition, expenses, expenses/receipts) read the same value.
 */
export function useSelectedMonth(): string {
  const searchParams = useSearchParams();
  const param = searchParams?.get("month") ?? null;
  if (param && MONTH_PATTERN.test(param)) return param;
  return currentMonth();
}