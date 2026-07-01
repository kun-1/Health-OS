"use client";

/**
 * `/expenses` module — pure analysis surface.
 *
 * Per user feedback on 2026-07-01: this page renders just the budget +
 * structure analyses stacked into a single panel. There is no header
 * brand strip (LifeShell sidebar + topbar are enough), no sub-tab nav
 * (both panels always visible), and no input affordances (uploader /
 * manual / CSV / BudgetSettings / editable LedgerTask — all on
 * /expenses/receipts).
 */

import { useState } from "react";

import { BudgetTask } from "./budget-task";
import { StructureTask } from "./structure-task";
import { ExpenseBanners } from "./shared/expense-banners";
import { useExpenseData } from "./shared/use-expense-data";
import { useSelectedMonth } from "@/components/shared/use-selected-month";
import { daysRemainingInMonth, LoadingPanel as ExpenseLoadingPanel } from "./shared/task-helpers";

import "./expenses.css";

export function ExpensesModule() {
  const month = useSelectedMonth();
  const { analytics, loadError, reload } = useExpenseData(month);
  const [message] = useState("");

  const days = analytics ? daysRemainingInMonth(analytics.month) : 0;

  return (
    <div className="exp-analytics">
      <ExpenseBanners error="" loadError={loadError} message={message} />
      {analytics ? (
        <>
          <BudgetTask analytics={analytics} days={days} />
          <StructureTask analytics={analytics} />
        </>
      ) : (
        <ExpenseLoadingPanel />
      )}
      {/* Hidden reload trigger for the banner retry button. The component
          above already shows loadError; clicking Retry (rendered inside
          ExpenseBanners in older versions) would call this. */}
      <button type="button" onClick={() => void reload()} style={{ display: "none" }} aria-hidden />
    </div>
  );
}