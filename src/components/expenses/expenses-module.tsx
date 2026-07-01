"use client";

/**
 * `/expenses` module — pure analysis surface.
 *
 * Sub-tabs:
 *   - 预算 (budget)  → BudgetTask
 *   - 分类 (structure) → StructureTask
 *
 * No interactive affordances live here (per user choice B on 2026-06-30):
 * receipt upload, manual entry, CSV export, BudgetSettings, the editable
 * LedgerTask — all moved to /expenses/receipts. This page renders the
 * brand strip + sub-tab nav + the selected task's charts only.
 */

import { useState } from "react";
import { CircleDollarSign, LineChart } from "lucide-react";

import { BudgetTask } from "./budget-task";
import { StructureTask } from "./structure-task";
import {
  currentMonth,
  daysRemainingInMonth,
  LoadingPanel as ExpenseLoadingPanel
} from "./shared/task-helpers";
import { ExpenseBanners } from "./shared/expense-banners";
import { ExpensesHeader } from "./shared/expenses-header";
import { useExpenseData } from "./shared/use-expense-data";
import { SubTabNav, type SubTab } from "@/components/shared/sub-tab-nav";

import "./expenses.css";

type ExpenseSubTask = "budget" | "structure";

const SUBTABS: ReadonlyArray<SubTab<ExpenseSubTask>> = [
  { id: "budget", label: "预算", icon: LineChart },
  { id: "structure", label: "分类", icon: CircleDollarSign }
];

export function ExpensesModule() {
  const [activeTask, setActiveTask] = useState<ExpenseSubTask>("budget");
  const [month] = useState(currentMonth());
  const { analytics, loadError, reload } = useExpenseData(month);
  const [message] = useState("");

  const days = analytics ? daysRemainingInMonth(analytics.month) : 0;

  return (
    <div className="exp-analytics">
      <ExpensesHeader kind="expenses" month={month} onReload={reload} showBudgetSettings={false} />
      <SubTabNav
        activeTab={activeTask}
        ariaLabel="支出了任务"
        idPrefix="exp-tab"
        onTabChange={setActiveTask}
        panelIdPrefix="exp-tabpanel"
        tabs={SUBTABS}
      />
      <ExpenseBanners error="" loadError={loadError} message={message} />
      {analytics ? (
        <div role="tabpanel" id={`exp-tabpanel-${activeTask}`} aria-labelledby={`exp-tab-${activeTask}`}>
          {activeTask === "budget" ? <BudgetTask analytics={analytics} days={days} /> : null}
          {activeTask === "structure" ? <StructureTask analytics={analytics} /> : null}
        </div>
      ) : (
        <ExpenseLoadingPanel />
      )}
    </div>
  );
}