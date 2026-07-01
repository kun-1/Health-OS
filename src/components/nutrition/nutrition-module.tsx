"use client";

/**
 * `/nutrition` module — unified analysis board.
 *
 * The legacy three-tab layout (今日判断 / 结构诊断 / 趋势分析) has been
 * replaced by a single scrollable board: hero score, interactive trend +
 * smart narrative, and structure details. The board is implemented in
 * `nutrition-analysis-board.tsx` so this file stays focused on data
 * fetching and shell layout.
 */

import { useEffect, useState } from "react";

import type { NutritionCategory, NutritionReport } from "@/lib/nutrition/types";

import { useSelectedMonth } from "@/components/shared/use-selected-month";
import { NutritionAnalysisBoard } from "./nutrition-analysis-board";
import type { TrendMonth } from "./nutrition-extras";

import "./nutrition.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; report: NutritionReport };

type TrendState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; months: TrendMonth[]; tracked: ReadonlyArray<NutritionCategory> };

export function NutritionModule() {
  const period = useSelectedMonth();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [trend, setTrend] = useState<TrendState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/nutrition/score?period=${encodeURIComponent(period)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as NutritionReport;
      })
      .then((report) => {
        if (!cancelled) setState({ kind: "ok", report });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    setTrend({ kind: "loading" });
    fetch(`/api/nutrition/trend?months=6&end=${period}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { months: TrendMonth[]; tracked: ReadonlyArray<NutritionCategory> };
      })
      .then((data) => {
        if (!cancelled) setTrend({ kind: "ok", months: data.months, tracked: data.tracked });
      })
      .catch((err: unknown) => {
        if (!cancelled) setTrend({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="life-os-nutrition">
      {state.kind === "loading" ? (
        <LoadingState label="营养数据加载中..." />
      ) : state.kind === "error" ? (
        <ErrorState message={state.message} />
      ) : (
        <NutritionAnalysisBoard report={state.report} trend={trend} />
      )}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="nut-state">
      <div className="nut-state__pulse" />
      <div>{label}</div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="nut-error">
      加载失败: {message}
    </div>
  );
}
