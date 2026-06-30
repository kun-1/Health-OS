"use client";

/**
 * `/expenses` module — pure analysis surface.
 *
 * Sub-tabs:
 *   - 预算 (budget)  → BudgetTask from the legacy client
 *   - 分类 (structure) → StructureTask from the legacy client
 *
 * What does NOT live here (moved to /expenses/receipts):
 *   - The receipt uploader (uploads are record-processing, not analysis)
 *   - The pending receipts queue + OCR jobs
 *   - LedgerTask (posted-transactions list with edit/delete)
 *   - Bulk selection toolbar
 *
 * 记一笔 (manual entry) and 导出 CSV stay because they're quick actions
 * that an analyst might want while looking at budget / category charts.
 *
 * Header / data loader / banners are extracted into shared modules
 * (expenses-header / use-expense-data / expense-banners) so the two
 * pages don't drift visually.
 */

import { useCallback, useState } from "react";
import { CircleDollarSign, LineChart } from "lucide-react";

import { formatMoney } from "@/lib/expenses/money";

import {
  BudgetTask,
  currentMonth,
  daysRemainingInMonth,
  LoadingPanel as ExpenseLoadingPanel,
  StructureTask,
  type ManualExpenseInput
} from "./expenses-client";
import { ExpenseBanners } from "./expense-banners";
import { ExpensesHeader } from "./expenses-header";
import { useExpenseData } from "./use-expense-data";

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

export function ExpensesModule() {
  const [activeTask, setActiveTask] = useState<ExpenseSubTask>("budget");
  const [month] = useState(currentMonth());
  const { analytics, loadError, reload } = useExpenseData(month);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);

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

  const days = analytics ? daysRemainingInMonth(analytics.month) : 0;

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
      <ExpenseBanners error={error} loadError={loadError} message={message} onRetry={() => void reload()} />
      {analytics ? (
        <>
          {activeTask === "budget" ? <BudgetTask analytics={analytics} days={days} /> : null}
          {activeTask === "structure" ? <StructureTask analytics={analytics} /> : null}
        </>
      ) : (
        <ExpenseLoadingPanel />
      )}
    </div>
  );
}