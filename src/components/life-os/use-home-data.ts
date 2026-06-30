"use client";

import { useEffect, useState } from "react";

import type { ExpenseAnalytics } from "@/lib/expenses/types";
import type { NutritionReport } from "@/lib/nutrition/types";

import { structureScore } from "@/lib/life-os/selectors";

export type TrendMonth = {
  period: string;
  grams: Record<string, number>;
};

export type Source<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: T };

export type ScorePayload = {
  report: NutritionReport;
  score: number;
};

export type HomeData = {
  month: string;
  tz: string;
  today: string;
  score: Source<ScorePayload>;
  trend: Source<TrendMonth[]>;
  analytics: Source<ExpenseAnalytics>;
};

/** Build a YYYY-MM string for "today" in the local timezone. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }
  return (await res.json()) as T;
}

/**
 * Loads the three home-page data sources in parallel and exposes a
 * per-source loading / error / ok state so each card can degrade
 * independently. The hook is intentionally state-only — presentation
 * lives in <LifeHome>.
 */
export function useHomeData(): HomeData {
  const [score, setScore] = useState<Source<ScorePayload>>({ kind: "loading" });
  const [trend, setTrend] = useState<Source<TrendMonth[]>>({ kind: "loading" });
  const [analytics, setAnalytics] = useState<Source<ExpenseAnalytics>>({ kind: "loading" });

  useEffect(() => {
    const month = currentMonth();
    const tz = "Asia/Shanghai";
    const controller = new AbortController();

    fetchJson<NutritionReport>(`/api/nutrition/score?period=${month}`, controller.signal)
      .then((report) => setScore({ kind: "ok", data: { report, score: structureScore(report) } }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setScore({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });

    fetchJson<TrendMonth[]>(`/api/nutrition/trend?months=6`, controller.signal)
      .then((rows) => setTrend({ kind: "ok", data: rows }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setTrend({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });

    fetchJson<ExpenseAnalytics>(`/api/expenses?month=${month}&tz=${tz}`, controller.signal)
      .then((data) => setAnalytics({ kind: "ok", data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setAnalytics({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });

    return () => controller.abort();
  }, []);

  return {
    month: currentMonth(),
    tz: "Asia/Shanghai",
    today: todayIso(),
    score,
    trend,
    analytics
  };
}