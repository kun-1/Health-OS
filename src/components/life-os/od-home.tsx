"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useHomeData } from "./use-home-data";
import { ODCalendarCard } from "./od-calendar-card";
import { ODKpiCard } from "./od-kpi-card";
import { ODTrendChart } from "./od-trend-chart";
import { ODActivityTabs, type ODActivityEntry } from "./od-activity-tabs";
import { ODClusters } from "./od-clusters";
import { ODDayDrawer, type ODTransactionRow } from "./od-day-drawer";
import { ODSectionTitle } from "./od-section-title";
import { ODToastProvider, useODToast } from "./od-toast";

import {
  formatYuan,
  todaySpendCents
} from "@/lib/life-os/signals";

import "./od-home.css";

type Range = "1m" | "3m" | "6m";

function yuan(cents: number): string {
  return `¥${formatYuan(cents)}`;
}

function projectRows(
  transactions: ReadonlyArray<{
    id: number;
    merchant_name: string;
    purchased_at: string;
    total_amount: number;
    currency: string;
    excluded_from_budget: boolean;
    receipt_id: number | null;
    items: ReadonlyArray<{ category_zh: string }>;
  }>,
  pendingReceipts: ReadonlyArray<{
    id: number;
    extracted: { merchant_name: string | null; total_amount: number | null; currency: string };
    created_at: string;
  }>
): ODTransactionRow[] {
  const out: ODTransactionRow[] = [];
  for (const tx of transactions) {
    // purchased_at is an ISO string. The day cell is keyed by local date.
    const day = tx.purchased_at ? tx.purchased_at.slice(0, 10) : "";
    if (!day) continue;
    out.push({
      id: tx.id,
      day,
      title: tx.merchant_name || "(未命名商家)",
      subtitle: `${tx.receipt_id ? "票据 · " : ""}${tx.items[0]?.category_zh ?? "其他"}`,
      kind: "transaction",
      amount: tx.total_amount,
      currency: tx.currency,
      status: "confirmed",
      excluded: tx.excluded_from_budget
    });
  }
  for (const r of pendingReceipts) {
    const day = r.created_at ? r.created_at.slice(0, 10) : "";
    if (!day) continue;
    out.push({
      id: r.id + 1_000_000, // avoid id collision with transactions
      day,
      title: r.extracted.merchant_name ?? "(待识别票据)",
      subtitle: "票据 · 待确认",
      kind: "receipt",
      amount: r.extracted.total_amount ?? null,
      currency: r.extracted.currency,
      status: "pending",
      excluded: false
    });
  }
  return out;
}

function exportRowsToCsv(rows: ReadonlyArray<ODTransactionRow>): string {
  const header = ["日期", "项目", "金额", "币种", "状态", "类型", "不计入预算"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      r.day,
      r.title,
      r.amount != null ? r.amount.toFixed(2) : "",
      r.currency,
      r.status === "pending" ? "待确认" : r.status === "paused" ? "已暂停" : "已入账",
      r.kind === "receipt" ? "票据" : r.kind === "recurring" ? "定期" : "交易",
      r.excluded ? "yes" : "no"
    ];
    lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
  }
  return lines.join("\n");
}

/** Inner body — assumes ODToastProvider is mounted above it. */
function ODHomeBody() {
  const router = useRouter();
  const toast = useODToast();
  const { month, today, score, trend, analytics, refresh } = useHomeData();

  const [range, setRange] = useState<Range>("6m");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());

  const scoreState = score.kind === "ok" ? score.data : null;
  const analyticsState = analytics.kind === "ok" ? analytics.data : null;
  const trendState = trend.kind === "ok" ? trend.data : null;

  const todaySpend = analyticsState ? todaySpendCents(analyticsState, today) : 0;
  const coveragePct = scoreState ? scoreState.report.coveragePct : null;
  const pendingReceipts = useMemo(
    () => analyticsState?.pending_receipts ?? [],
    [analyticsState]
  );
  const recurringCount = 4; // hard-coded until a /api/expenses/recurring?active=true count is wired

  const rows = useMemo<ODTransactionRow[]>(() => {
    if (!analyticsState) return [];
    return projectRows(analyticsState.recent_transactions, pendingReceipts);
  }, [analyticsState, pendingReceipts]);

  // Sort rows by day for CSV export.
  const sortedRows = useMemo(
    () => rows.slice().sort((a, b) => (a.day < b.day ? 1 : -1)),
    [rows]
  );

  // Export CSV: callable from cluster button + topbar op-quick via event.
  const handleExportCsv = useCallback(() => {
    if (rows.length === 0) {
      toast.show("本月没有可导出的数据");
      return;
    }
    const csv = exportRowsToCsv(sortedRows);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `health-os-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.show("CSV 已导出");
  }, [rows, sortedRows, month, toast]);

  // Run rules: topbar + cluster button both land here.
  const handleRunRules = useCallback(() => {
    toast.show("立即跑一次 — 等待下次定时任务触发（通常 1 小时内）");
    router.push("/expenses/recurring");
  }, [router, toast]);

  // Topbar op-quick buttons dispatch via window custom events; we also
  // honour the `?od=clusterId` query param so navigating from another
  // page can land on a specific cluster. The `?od=` param is only
  // handled on initial mount — subsequent month switches should not
  // re-scroll the cluster.
  useEffect(() => {
    function onExport() {
      handleExportCsv();
    }
    function onRun() {
      handleRunRules();
    }
    window.addEventListener("od:export-csv", onExport);
    window.addEventListener("od:run-rules", onRun);
    return () => {
      window.removeEventListener("od:export-csv", onExport);
      window.removeEventListener("od:run-rules", onRun);
    };
  }, [handleExportCsv, handleRunRules]);

  // Mount-only: handle the `?od=` dispatch param once. Reads directly
  // from window.location to avoid re-running on every searchParams change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const odParam = params.get("od");
    if (!odParam) return;
    if (odParam === "export-csv") handleExportCsv();
    else if (odParam === "run-rules") handleRunRules();
    else if (odParam === "batch-confirm") {
      setTimeout(() => window.dispatchEvent(new CustomEvent("od:batch-confirm")), 0);
    }
    else if (odParam === "open-budget") {
      setTimeout(() => window.dispatchEvent(new CustomEvent("od:open-budget")), 0);
    }
    else {
      const el = document.getElementById(odParam);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("od-flash");
      setTimeout(() => el?.classList.remove("od-flash"), 900);
    }
    // Strip the param from the URL so a refresh doesn't re-dispatch.
    params.delete("od");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Activity entries — derive from insights + recent transactions so the
  // "近期交易" tab has real data while the "活动流" tab also surfaces
  // observation entries. Score delta is taken from the trend last-vs-prev.
  const activityEntries = useMemo<ODActivityEntry[]>(() => {
    const out: ODActivityEntry[] = [];
    // Recent transactions
    if (analyticsState) {
      for (const tx of analyticsState.recent_transactions.slice(0, 10)) {
        out.push({
          id: `tx-${tx.id}`,
          text: `${tx.merchant_name} · ¥${tx.total_amount.toFixed(2)}`,
          meta: tx.purchased_at.slice(0, 10),
          kind: "spending",
          isTransaction: true
        });
      }
    }
    // Trend deltas
    if (trendState && trendState.length >= 2) {
      const last = trendState[trendState.length - 1];
      const prev = trendState[trendState.length - 2];
      const lastGrams = Object.values(last.grams).reduce((s, n) => s + n, 0);
      const prevGrams = Object.values(prev.grams).reduce((s, n) => s + n, 0);
      const dir = lastGrams > prevGrams ? "上升" : lastGrams < prevGrams ? "下降" : "持平";
      out.push({
        id: `trend-${last.period}`,
        text: `${last.period} 营养结构 ${dir}`,
        meta: `覆盖 ${Object.keys(last.grams).length} 类食物`,
        kind: "nutrition"
      });
    }
    if (scoreState) {
      out.push({
        id: `score-${month}`,
        text: `本月营养评分 ${Math.round(scoreState.score)}`,
        meta: `覆盖 ${scoreState.report.coveragePct.toFixed(0)}%`,
        kind: "health"
      });
    }
    if (pendingReceipts.length > 0) {
      out.push({
        id: `pending-${month}`,
        text: `${pendingReceipts.length} 张票据待确认`,
        meta: "去 /expenses/transactions 处理",
        kind: "risk"
      });
    }
    return out;
  }, [analyticsState, trendState, scoreState, pendingReceipts, month]);

  // ---------- Cluster action handlers ----------

  const handleNewReceipt = useCallback(() => {
    router.push("/expenses/transactions");
    toast.show("去 /expenses/transactions 上传票据");
  }, [router, toast]);

  const handleAddEntry = useCallback(() => {
    router.push("/expenses/transactions");
    toast.show("去 /expenses/transactions 手动记一笔");
  }, [router, toast]);

  const handleBatchConfirm = useCallback(async () => {
    const targets = rows.filter((r) => selectedRowIds.has(r.id) && r.status === "pending" && r.kind !== "receipt");
    if (targets.length === 0) {
      toast.show("请先选择行 — 票据需到 /expenses/transactions 走完整流程");
      return;
    }
    let n = 0;
    for (const row of targets) {
      const res = await fetch(`/api/expenses/transactions/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedFromBudget: false })
      });
      if (res.ok) n += 1;
    }
    toast.show(`已确认 ${n} 项`);
    setSelectedRowIds(new Set());
    refresh();
  }, [rows, selectedRowIds, toast, refresh]);

  useEffect(() => {
    function onConfirm() {
      handleBatchConfirm();
    }
    window.addEventListener("od:batch-confirm", onConfirm);
    return () => window.removeEventListener("od:batch-confirm", onConfirm);
  }, [handleBatchConfirm]);

  const handleBatchDelete = useCallback(async () => {
    const targets = rows.filter((r) => selectedRowIds.has(r.id));
    if (targets.length === 0) {
      toast.show("请先选择行");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(`批量删除 ${targets.length} 项?`)) return;
    let n = 0;
    for (const row of targets) {
      const url =
        row.kind === "receipt"
          ? `/api/expenses/receipts/${row.id - 1_000_000}`
          : `/api/expenses/transactions/${row.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) n += 1;
    }
    toast.show(`已删除 ${n} 项`);
    setSelectedRowIds(new Set());
    refresh();
  }, [rows, selectedRowIds, toast, refresh]);

  const handleExcludeSelected = useCallback(async () => {
    const targets = rows.filter((r) => selectedRowIds.has(r.id) && r.kind === "transaction");
    if (targets.length === 0) {
      toast.show("请先选择行 — 仅交易支持不计入预算");
      return;
    }
    let n = 0;
    for (const row of targets) {
      const res = await fetch(`/api/expenses/transactions/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedFromBudget: true })
      });
      if (res.ok) n += 1;
    }
    toast.show(`已标记 ${n} 项不计入预算`);
    refresh();
  }, [rows, selectedRowIds, toast, refresh]);

  const handleEditSelected = useCallback(() => {
    if (selectedRowIds.size === 0) {
      toast.show("请先选择行");
      return;
    }
    router.push(`/expenses/transactions?month=${month}`);
  }, [selectedRowIds, month, router, toast]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedRowIds.size === 0) {
      toast.show("请先选择行");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(`删除 ${selectedRowIds.size} 项?`)) return;
    const targets = rows.filter((r) => selectedRowIds.has(r.id));
    let n = 0;
    for (const row of targets) {
      const url =
        row.kind === "receipt"
          ? `/api/expenses/receipts/${row.id - 1_000_000}`
          : `/api/expenses/transactions/${row.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) n += 1;
    }
    toast.show(`已删除 ${n} 项`);
    setSelectedRowIds(new Set());
    refresh();
  }, [rows, selectedRowIds, toast, refresh]);

  const handleClearSelection = useCallback(() => {
    setSelectedRowIds(new Set());
  }, []);

  const handleBudgetSaved = useCallback(
    (next: { baseBudgetCents: number; primaryCurrency: string }) => {
      // useHomeData doesn't expose a budget refetch, so we trigger a full
      // page refresh — the next month fetch will pick up the new settings.
      refresh();
      void next;
    },
    [refresh]
  );

  return (
    <div className="od-home">
      <ODSectionTitle>概览指标</ODSectionTitle>
      <div className="od-kpi-grid">
        <ODKpiCard
          delta={
            scoreState ? `覆盖 ${scoreState.report.coveragePct.toFixed(0)}%` : undefined
          }
          label="营养评分"
          link={{ label: "查看营养", href: `/nutrition?month=${encodeURIComponent(month)}` }}
          tag={
            scoreState
              ? { tone: "nutrition", text: `↑ 本月 ${Math.round(scoreState.score)}` }
              : { tone: "muted", text: "加载中" }
          }
          value={
            scoreState ? (
              <>
                {Math.round(scoreState.score)}
                <span className="unit">/100</span>
              </>
            ) : (
              "—"
            )
          }
        />
        <ODKpiCard
          delta={
            analyticsState
              ? `本月 ${yuan(analyticsState.spent_this_month * 100)}`
              : undefined
          }
          label="今日支出"
          link={{
            label: "查看支出",
            href: `/expenses/analytics?month=${encodeURIComponent(month)}`
          }}
          tag={
            analyticsState
              ? {
                  tone: "spending",
                  text: `预算 ${analyticsState.budget_progress_label ?? "—"}`
                }
              : { tone: "muted", text: "加载中" }
          }
          value={todaySpend > 0 ? yuan(todaySpend) : "—"}
        />
        <ODKpiCard
          delta="今日 0 / 0 项已完成"
          label="习惯 / 任务完成度"
          link={{ label: "查看任务", onClick: () => toast.show("习惯任务即将上线") }}
          tag={{ tone: "health", text: "+1 streak" }}
          value={
            <>
              5<span className="unit">/7</span>
            </>
          }
        />
        <ODKpiCard
          delta={
            pendingReceipts.length > 0
              ? `${pendingReceipts.length} 张票据待确认`
              : "有重量条目 ÷ 总食物条目"
          }
          label="记录完整度"
          link={{
            label: "查看记录完整度",
            href: `/nutrition?month=${encodeURIComponent(month)}`
          }}
          tag={
            coveragePct != null
              ? { tone: "sleep", text: `${coveragePct.toFixed(0)}%` }
              : { tone: "muted", text: "加载中" }
          }
          value={
            <>
              {coveragePct != null ? coveragePct.toFixed(0) : "—"}
              <span className="unit">%</span>
            </>
          }
        />
      </div>

      <ODSectionTitle>趋势 · 信号</ODSectionTitle>
      <div className="od-row">
        <div className="od-card">
          <div className="od-card-head">
            <div className="od-card-title">6 个月趋势</div>
          </div>
          <ODTrendChart onChangeRange={setRange} range={range} />
        </div>
        <div className="od-card">
          <ODActivityTabs entries={activityEntries} />
        </div>
      </div>

      <ODSectionTitle>本月日历</ODSectionTitle>
      <ODCalendarCard month={month} onOpenDay={setOpenDay} rows={rows} />

      <ODSectionTitle>Health OS controls</ODSectionTitle>
      <ODClusters
        budgetCents={analyticsState ? analyticsState.base_monthly_budget : 600000}
        currency={analyticsState?.primary_currency ?? "CNY"}
        month={month}
        onAddEntry={handleAddEntry}
        onBatchConfirm={handleBatchConfirm}
        onBatchDelete={handleBatchDelete}
        onBudgetSaved={handleBudgetSaved}
        onClearSelection={handleClearSelection}
        onDeleteSelected={handleDeleteSelected}
        onEditSelected={handleEditSelected}
        onExcludeSelected={handleExcludeSelected}
        onExportCsv={handleExportCsv}
        onNewReceipt={handleNewReceipt}
        onRunRules={handleRunRules}
        onShowPending={() => toast.show("暂停 / 启用 — 等待定时任务支持切换")}
        pendingCount={pendingReceipts.length + recurringCount}
      />

      <ODDayDrawer
        onClose={() => setOpenDay(null)}
        onMutated={refresh}
        onSelectionChange={setSelectedRowIds}
        openDay={openDay}
        rows={rows}
        selected={selectedRowIds}
      />
    </div>
  );
}

/** Top-level wrapper: mounts the toast provider and a track for the
 *  row-selection set that cluster actions consult. */
export function ODHome() {
  return (
    <ODToastProvider>
      <ODHomeBody />
    </ODToastProvider>
  );
}
