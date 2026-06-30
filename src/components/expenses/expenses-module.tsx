"use client";

/**
 * `/expenses` module. Two internal sub-tabs:
 *   - 预算 (budget)
 *   - 分类 (structure)
 *
 * Sidebar selection (支出) is handled by LifeSidebar; this component only
 * manages the in-page tab nav. The pending receipt review and OCR queue
 * live on `/expenses/receipts` (see receipts-module.tsx).
 *
 * Data fetching and the record-keeping ledger are duplicated from the
 * legacy ExpensesClient intentionally — the legacy file is kept in place
 * for reference but is no longer imported by any route.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, LineChart, Plus } from "lucide-react";

import { formatMoney } from "@/lib/expenses/money";
import { getStoredBudgetCents, getStoredPrimaryCurrency } from "@/lib/expenses/settings";
import type {
  ExpenseAnalytics,
  ExpenseTransaction,
  ExtractedExpenseReceipt
} from "@/lib/expenses/types";

import {
  BudgetTask,
  currentMonth,
  daysRemainingInMonth,
  formatUtcOffsetForClient,
  LedgerTask,
  LoadingPanel as ExpenseLoadingPanel,
  StructureTask,
  transactionToExtracted,
  type LoadError as ExpenseLoadError,
  type ManualExpenseInput
} from "./expenses-client";
import { BudgetSettings } from "./budget-settings";
import { BulkSelectionProvider, type BulkItem } from "./bulk-selection";
import { BulkToolbar } from "./bulk-toolbar";
import { ManualExpensePanel } from "./manual-expense-panel";
import { ReceiptUploader } from "./receipt-uploader";

import "./expenses.css";

type ExpenseSubTask = "budget" | "structure";

const SUBTABS: Array<{ id: ExpenseSubTask; label: string; icon: typeof LineChart }> = [
  { id: "budget", label: "预算", icon: LineChart },
  { id: "structure", label: "分类", icon: CircleDollarSign }
];

function runSubTabTransition(update: () => void) {
  if (typeof document === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const transitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };
  if (typeof transitionDocument.startViewTransition !== "function") {
    update();
    return;
  }
  transitionDocument.startViewTransition(update);
}

function SubTabNav({
  activeTask,
  onTaskChange
}: {
  activeTask: ExpenseSubTask;
  onTaskChange: (task: ExpenseSubTask) => void;
}) {
  return (
    <nav className="exp-tasknav" aria-label="支出了任务">
      {SUBTABS.map((task) => {
        const Icon = task.icon;
        return (
          <button
            className="exp-tasknav__item"
            data-active={task.id === activeTask ? "true" : undefined}
            key={task.id}
            onClick={() => onTaskChange(task.id)}
            type="button"
          >
            <Icon aria-hidden />
            {task.label}
          </button>
        );
      })}
    </nav>
  );
}

function ShellHeader({
  month,
  onManualOpen,
  reload,
  activeTask,
  onTaskChange
}: {
  month: string;
  onManualOpen: () => void;
  reload: () => Promise<void>;
  activeTask: ExpenseSubTask;
  onTaskChange: (task: ExpenseSubTask) => void;
}) {
  return (
    <header className="exp-shell__header">
      <div className="exp-shell__brand">
        <div className="exp-shell__logo"><LineChart aria-hidden /></div>
        <div>
          <div className="exp-shell__name">支出</div>
          <div className="exp-shell__crumb">支出 / {SUBTABS.find((t) => t.id === activeTask)?.label ?? ""}</div>
        </div>
      </div>
      <div className="exp-shell__actions">
        <BudgetSettings month={month} onSaved={() => void reload()} />
      </div>
      <SubTabNav activeTask={activeTask} onTaskChange={onTaskChange} />
      <div className="exp-workbar">
        <ReceiptUploader
          compact
          hint="最多 2 张，失败会进入重试队列"
          maxBytesPerFile={8 * 1024 * 1024}
          maxFiles={2}
          onUpload={(formData) => {
            // Receipt uploads from this page are routed to the dedicated
            // /expenses/receipts page; redirect the user there and post
            // the form data via the same API.
            void fetch("/api/expenses/receipts", { method: "POST", body: formData }).finally(() => {
              window.location.href = "/expenses/receipts";
            });
          }}
        />
        <button className="exp-workbar__button" onClick={onManualOpen} type="button">
          <Plus aria-hidden />
          记一笔
        </button>
        <a className="exp-workbar__button" href={`/api/expenses/export?format=csv&month=${encodeURIComponent(month)}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai")}`}>
          导出 CSV
        </a>
      </div>
    </header>
  );
}

export function ExpensesModule() {
  const [activeTask, setActiveTask] = useState<ExpenseSubTask>("budget");
  const [month] = useState(currentMonth());
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [loadError, setLoadError] = useState<ExpenseLoadError | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingDrafts, setPendingDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});
  const [transactionDrafts, setTransactionDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);

  const orderedItems = useMemo<BulkItem[]>(() => {
    const receipts = (analytics?.pending_receipts ?? [])
      .filter((r) => r.status === "pending_review")
      .map((r) => ({ id: r.id, kind: "receipt" as const }));
    const transactions = (analytics?.recent_transactions ?? []).map((t) => ({
      id: t.id,
      kind: "transaction" as const
    }));
    return [...receipts, ...transactions];
  }, [analytics]);

  const load = useCallback(async () => {
    setLoadError(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC${formatUtcOffsetForClient()}`;
    const query = new URLSearchParams({
      month,
      tz,
      budget: String(getStoredBudgetCents()),
      primaryCurrency: getStoredPrimaryCurrency()
    });
    let response: Response;
    try {
      response = await fetch(`/api/expenses?${query.toString()}`);
    } catch (err) {
      setLoadError({ kind: "network", message: err instanceof Error ? err.message : "网络请求失败" });
      return;
    }
    if (!response.ok) {
      setLoadError({ kind: response.status >= 500 ? "server" : "client", message: `服务器返回 ${response.status}` });
      return;
    }
    try {
      const data = (await response.json()) as ExpenseAnalytics;
      setAnalytics(data);
      setPendingDrafts(Object.fromEntries(data.pending_receipts.map((r) => [r.id, r.extracted])));
      setTransactionDrafts(Object.fromEntries(data.recent_transactions.map((t) => [t.id, transactionToExtracted(t)])));
    } catch (err) {
      setLoadError({ kind: "client", message: err instanceof Error ? err.message : "解析响应失败" });
    }
  }, [month]);

  useEffect(() => {
    load().catch((err) => setLoadError({ kind: "network", message: err instanceof Error ? err.message : "消费数据加载失败" }));
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const handleTaskChange = useCallback((task: ExpenseSubTask) => {
    if (task === activeTask) return;
    runSubTabTransition(() => setActiveTask(task));
  }, [activeTask]);

  async function createManualExpense(input: ManualExpenseInput) {
    setError("");
    setMessage("");
    setManualBusy(true);
    try {
      const response = await fetch("/api/expenses/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "手动支出保存失败");
        return;
      }
      setManualOpen(false);
      setMessage(`已记入: ${input.item_name} ${input.amount === null ? "-" : formatMoney(input.amount, input.currency ?? "CNY")}`);
      await load();
    } finally {
      setManualBusy(false);
    }
  }

  async function updatePosted(transaction: ExpenseTransaction) {
    const extracted = transactionDrafts[transaction.id] ?? transactionToExtracted(transaction);
    setError("");
    setMessage("");
    const response = await fetch(`/api/expenses/transactions/${transaction.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extracted })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "更新失败");
      return;
    }
    setMessage(`已入账 #${transaction.id} 已更新`);
    await load();
  }

  async function deletePosted(transaction: ExpenseTransaction) {
    if (!window.confirm(`确认删除已入账 #${transaction.id}？本地图片也会一起删除。`)) return;
    setError("");
    setMessage("");
    const response = await fetch(`/api/expenses/transactions/${transaction.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "删除失败");
      return;
    }
    setMessage(`已入账 #${transaction.id} 已删除`);
    await load();
  }

  const days = analytics ? daysRemainingInMonth(analytics.month) : 0;

  return (
    <div className="exp-analytics">
      <ShellHeader
        activeTask={activeTask}
        month={month}
        onManualOpen={() => setManualOpen(true)}
        onTaskChange={handleTaskChange}
        reload={load}
      />
      <ManualExpensePanel busy={manualBusy} onClose={() => setManualOpen(false)} onSave={createManualExpense} open={manualOpen} />
      {error ? <div className="exp-banner exp-banner--error">{error}</div> : null}
      {loadError ? (
        <div className="exp-banner exp-banner--error" role="alert">
          <span>
            {loadError.kind === "network"
              ? `网络问题: ${loadError.message}`
              : loadError.kind === "server"
                ? `服务器错误: ${loadError.message}`
                : `客户端错误: ${loadError.message}`}
          </span>
          <button className="exp-btn exp-btn--secondary exp-btn--sm" onClick={() => void load()} type="button">重试</button>
        </div>
      ) : null}
      {message ? <div className="exp-banner exp-banner--ok">{message}</div> : null}

      <BulkSelectionProvider clearKey={month} items={orderedItems}>
        {analytics ? (
          <BulkToolbar mode="main" onError={setError} onMessage={setMessage} receiptDrafts={pendingDrafts} reload={() => load()} />
        ) : null}
        {analytics ? (
          <>
            {activeTask === "budget" ? <BudgetTask analytics={analytics} days={days} /> : null}
            {activeTask === "structure" ? <StructureTask analytics={analytics} /> : null}
            <LedgerTask
              analytics={analytics}
              deletePosted={deletePosted}
              setTransactionDrafts={setTransactionDrafts}
              transactionDrafts={transactionDrafts}
              updatePosted={updatePosted}
            />
          </>
        ) : (
          <ExpenseLoadingPanel />
        )}
      </BulkSelectionProvider>
    </div>
  );
}
