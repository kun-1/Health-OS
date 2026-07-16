"use client";

/**
 * `/expenses/analytics` module — pure analysis surface.
 *
 * Shows budget trend + category structure. The budget settings button lives
 * in the module header; all input / record-management affordances are on the
 * sibling sub-pages (/expenses/transactions, /expenses/receipts).
 */

import { useState } from "react";

import { AnalysisViewTabs, type AnalysisViewTab } from "@/components/shared/analysis-view-tabs";

import { BudgetTask } from "./budget-task";
import { StructureTask } from "./structure-task";
import { DiagnosticsSummary } from "./diagnostics-summary";
import { ExpensesHeader } from "./shared/expenses-header";
import { ExpenseBanners } from "./shared/expense-banners";
import { useExpenseData } from "./shared/use-expense-data";
import { useSelectedMonth } from "@/components/shared/use-selected-month";
import type { ExpenseAnalytics } from "@/lib/expenses/types";
import { daysRemainingInMonth, LoadingPanel as ExpenseLoadingPanel } from "./shared/task-helpers";

import "./expenses.css";

type ExpenseView = "overview" | "trend" | "structure" | "data";

const EXPENSE_TABS: readonly AnalysisViewTab[] = [
  { id: "overview", label: "概览" },
  { id: "trend", label: "趋势" },
  { id: "structure", label: "支出构成" },
  { id: "data", label: "数据质量" }
];

function ExpenseConclusionPanel({ diagnostics }: { diagnostics: NonNullable<ExpenseAnalytics["diagnostics"]> }) {
  const score = diagnostics.composite.expense_score;
  const lead = diagnostics.budget_pace.explanations[0] ?? diagnostics.structure_risk.explanations[0] ?? "继续积累账单后，诊断会更稳定。";
  const tone = score >= 80 ? "稳健" : score >= 60 ? "需要留意" : "需要优先处理";

  return (
    <section className="exp-panel exp-panel--wide exp-conclusion-panel">
      <div className="exp-section-head exp-section-head--compact">
        <div>
          <p className="exp-eyebrow">本月结论</p>
          <h2>支出状态{tone}</h2>
        </div>
        <span className={`exp-status exp-status--score${score < 60 ? " is-danger" : ""}`}>{score} / 100</span>
      </div>
      <div className="exp-conclusion-grid">
        <div className="exp-conclusion-lead">
          <strong>{lead}</strong>
          <span>综合预算节奏、支出结构、账本可信度和异常情况得出。</span>
        </div>
        <div className="exp-conclusion-stat">
          <span>账本可信度</span>
          <strong>{diagnostics.money_semantics.score} / 100</strong>
        </div>
        <div className="exp-conclusion-stat">
          <span>待复核异常</span>
          <strong>{diagnostics.anomalies.unresolved_count} 项</strong>
        </div>
      </div>
    </section>
  );
}

export function ExpensesModule() {
  const month = useSelectedMonth();
  const { analytics, loadError, reload } = useExpenseData(month);
  const [view, setView] = useState<ExpenseView>("overview");

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
          <AnalysisViewTabs
            ariaLabel="支出分析视图"
            onChange={(next) => setView(next as ExpenseView)}
            tabs={EXPENSE_TABS}
            value={view}
          />
          {view === "overview" ? (
            <>
              <BudgetTask analytics={analytics} days={days} focus="overview" />
              {analytics.diagnostics ? <ExpenseConclusionPanel diagnostics={analytics.diagnostics} /> : null}
            </>
          ) : null}
          {view === "trend" ? <BudgetTask analytics={analytics} days={days} focus="trend" /> : null}
          {view === "structure" ? <StructureTask analytics={analytics} /> : null}
          {view === "data" ? <DiagnosticsSummary diagnostics={analytics.diagnostics} /> : null}
        </>
      ) : (
        <ExpenseLoadingPanel />
      )}
    </div>
  );
}
