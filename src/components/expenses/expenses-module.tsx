"use client";

/**
 * `/expenses` module — analysis surface.
 *
 * Sub-tabs:
 *   - 预算 (budget)  → BudgetTask
 *   - 分类 (structure) → StructureTask
 *
 * Also offers a collapsible "本月所有交易" section at the bottom so the
 * user can jump straight to editing a posted transaction without
 * leaving the analysis page (addresses the post-split UX gap).
 *
 * Receipts / OCR queue / pending-review / bulk operations all live on
 * `/expenses/receipts`. The receipt uploader is intentionally absent
 * here; uploads belong on the records-processing page.
 *
 * The shell header, data loader, and banners come from the shared
 * `expenses/shared/*` modules — kept identical to the receipts page so
 * the two pages don't drift visually.
 */

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CircleDollarSign, LineChart } from "lucide-react";

import { formatMoney } from "@/lib/expenses/money";
import type { ExpenseTransaction } from "@/lib/expenses/types";

import { BudgetTask } from "./budget-task";
import { BulkSelectionProvider, type BulkItem } from "./bulk-selection";
import { ConfirmDialog } from "./confirm-dialog";
import { LedgerTask } from "./ledger-task";
import { StructureTask } from "./structure-task";
import { ExpenseBanners } from "./shared/expense-banners";
import { ExpensesHeader } from "./shared/expenses-header";
import {
  currentMonth,
  daysRemainingInMonth,
  LoadingPanel as ExpenseLoadingPanel,
  transactionToExtracted,
  type ManualExpenseInput
} from "./shared/task-helpers";
import { useExpenseData } from "./shared/use-expense-data";

import "./expenses.css";

type ExpenseSubTask = "budget" | "structure";

const SUBTABS: Array<{ id: ExpenseSubTask; label: string; icon: typeof LineChart }> = [
  { id: "budget", label: "预算", icon: LineChart },
  { id: "structure", label: "分类", icon: CircleDollarSign }
];

function SubTabNav({
  activeTask,
  onTaskChange
}: {
  activeTask: ExpenseSubTask;
  onTaskChange: (task: ExpenseSubTask) => void;
}) {
  return (
    <nav aria-label="支出了任务" className="exp-tasknav" role="tablist">
      {SUBTABS.map((task) => {
        const Icon = task.icon;
        const isActive = task.id === activeTask;
        return (
          <button
            aria-selected={isActive}
            className="exp-tasknav__item"
            data-active={isActive ? "true" : undefined}
            id={`exp-task-tab-${task.id}`}
            key={task.id}
            onClick={() => onTaskChange(task.id)}
            role="tab"
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

export function ExpensesModule() {
  const [activeTask, setActiveTask] = useState<ExpenseSubTask>("budget");
  const [month] = useState(currentMonth());
  const {
    analytics,
    loadError,
    transactionDrafts,
    setTransactionDrafts,
    reload
  } = useExpenseData(month);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  /** Concerns 1: LedgerTask is back on /expenses but default-collapsed
   *  so the analysis page doesn't feel busy until the user explicitly
   *  asks for the transactions list. */
  const [showLedger, setShowLedger] = useState(false);
  // Replace window.confirm with the styled ConfirmDialog.
  const [pendingDelete, setPendingDelete] = useState<{
    message: string;
    run: () => Promise<void>;
  } | null>(null);

  const handleTaskChange = useCallback(
    (task: ExpenseSubTask) => {
      if (task === activeTask) return;
      setActiveTask(task);
    },
    [activeTask]
  );

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
      setMessage(
        `已记入: ${input.item_name} ${input.amount === null ? "-" : formatMoney(input.amount, input.currency ?? "CNY")}`
      );
      await reload();
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
    await reload();
  }

  async function deletePosted(transaction: ExpenseTransaction) {
    setPendingDelete({
      message: `确认删除已入账 #${transaction.id}？本地图片也会一起删除。`,
      run: async () => {
        setError("");
        setMessage("");
        const response = await fetch(`/api/expenses/transactions/${transaction.id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "删除失败");
          return;
        }
        setMessage(`已入账 #${transaction.id} 已删除`);
        await reload();
      }
    });
  }

  const days = analytics ? daysRemainingInMonth(analytics.month) : 0;
  const transactionCount = analytics?.recent_transactions.length ?? 0;

  // BulkSelectionProvider stays on /expenses (concern 2) so that any
  // future BudgetTask / StructureTask sub-component can opt into bulk
  // selection without the user noticing. We deliberately do NOT render
  // BulkToolbar here — that's an analysis page, not a records-processing
  // surface, and the toolbar would mislead the user.
  const orderedItems = useMemo<BulkItem[]>(
    () =>
      (analytics?.recent_transactions ?? []).map((t) => ({
        id: t.id,
        kind: "transaction" as const
      })),
    [analytics]
  );

  return (
    <div className="exp-analytics">
      <ExpensesHeader
        kind="expenses"
        month={month}
        manualExpense={{
          open: manualOpen,
          busy: manualBusy,
          onOpen: () => setManualOpen(true),
          onClose: () => setManualOpen(false),
          onSave: createManualExpense
        }}
        onReload={reload}
      />
      <SubTabNav activeTask={activeTask} onTaskChange={handleTaskChange} />
      <ExpenseBanners
        error={error}
        loadError={loadError}
        message={message}
        onRetry={() => void reload()}
      />
      {analytics ? (
        <>
          {activeTask === "budget" ? <BudgetTask analytics={analytics} days={days} /> : null}
          {activeTask === "structure" ? <StructureTask analytics={analytics} /> : null}

          {/*
            Collapsible ledger section. The toggle button is the only
            thing always rendered; LedgerTask itself mounts on demand so
            the analysis page stays light when the user just wants
            budget / category numbers.
          */}
          <section className="exp-ledger-collapse" aria-label="本月所有交易">
            <button
              type="button"
              className="exp-ledger-collapse__toggle"
              data-open={showLedger ? "true" : "false"}
              aria-expanded={showLedger}
              onClick={() => setShowLedger((v) => !v)}
            >
              {showLedger ? (
                <ChevronDown aria-hidden strokeWidth={2} />
              ) : (
                <ChevronRight aria-hidden strokeWidth={2} />
              )}
              <span>本月所有交易</span>
              <span className="exp-ledger-collapse__count">
                {transactionCount > 0 ? `${transactionCount} 条` : "暂无"}
              </span>
              {!showLedger ? (
                <span className="exp-ledger-collapse__hint">点击展开，可编辑 / 删除</span>
              ) : null}
            </button>
            {showLedger ? (
              <div className="exp-ledger-collapse__body">
                <BulkSelectionProvider clearKey={month} items={orderedItems}>
                  <LedgerTask
                    analytics={analytics}
                    deletePosted={deletePosted}
                    setTransactionDrafts={setTransactionDrafts}
                    transactionDrafts={transactionDrafts}
                    updatePosted={updatePosted}
                  />
                </BulkSelectionProvider>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <ExpenseLoadingPanel />
      )}
      <ConfirmDialog
        danger
        message={pendingDelete?.message ?? ""}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const next = pendingDelete;
          setPendingDelete(null);
          void next?.run();
        }}
        open={pendingDelete !== null}
        title="删除已入账"
      />
    </div>
  );
}