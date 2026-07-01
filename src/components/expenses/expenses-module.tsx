"use client";

/**
 * `/expenses/analytics` module — pure analysis surface.
 *
 * Shows budget trend + category structure. The budget settings button lives
 * in the module header; all input / record-management affordances are on the
 * sibling sub-pages (/expenses/transactions, /expenses/receipts).
 */

import { BudgetTask } from "./budget-task";
import { StructureTask } from "./structure-task";
import { ExpensesHeader } from "./shared/expenses-header";
import { ExpenseBanners } from "./shared/expense-banners";
import { useExpenseData } from "./shared/use-expense-data";
import { useSelectedMonth } from "@/components/shared/use-selected-month";
import { daysRemainingInMonth, LoadingPanel as ExpenseLoadingPanel } from "./shared/task-helpers";

import "./expenses.css";

export function ExpensesModule() {
  const month = useSelectedMonth();
  const { analytics, loadError, reload } = useExpenseData(month);

  const days = analytics ? daysRemainingInMonth(analytics.month) : 0;

  return (
    <div className="exp-analytics">
      <ExpensesHeader
        kind="expenses"
        month={month}
        showBudgetSettings
        onReload={reload}
      />
      <ExpenseBanners error="" loadError={loadError} message="" />
      {analytics ? (
        <>
          <BudgetTask analytics={analytics} days={days} />
          <StructureTask analytics={analytics} />
        </>
      ) : (
        <ExpenseLoadingPanel />
      )}
    </div>
  );
}