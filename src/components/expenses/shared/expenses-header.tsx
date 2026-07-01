"use client";

/**
 * Shared header for the expense sub-pages.
 *
 * Every interactive affordance (BudgetSettings, uploader) is opt-in via a
 * prop. /expenses/analytics passes BudgetSettings; /expenses/receipts passes
 * the uploader. Manual entry and CSV export live on /expenses/transactions.
 */

import type { ReactNode } from "react";
import { Plus, ReceiptText, Wallet } from "lucide-react";

import { BudgetSettings } from "../budget-settings";
import { ManualExpensePanel } from "../manual-expense-panel";
import { ReceiptUploader } from "../receipt-uploader";

import "./../expenses.css";

export type HeaderKind = "expenses" | "receipts";

type Props = {
  kind: HeaderKind;
  month: string;
  /** Receipt uploader slot. Omit to hide. */
  uploader?: {
    onUpload: (formData: FormData) => Promise<void> | void;
  };
  /** Manual expense entry slot. Omit to hide "+ 记一笔" and the modal. */
  manualExpense?: {
    open: boolean;
    busy: boolean;
    onOpen: () => void;
    onClose: () => void;
    onSave: Parameters<typeof ManualExpensePanel>[0]["onSave"];
  };
  /** Show the BudgetSettings (⚙ 预算) button in the actions slot. */
  showBudgetSettings?: boolean;
  /** CSV export slot. Omit to hide the "导出 CSV" link. */
  csvExport?: {
    month: string;
    tz: string;
  };
};

const COPY: Record<HeaderKind, { name: string; crumb: (sub: string | null) => string; logo: ReactNode }> = {
  expenses: {
    name: "支出",
    crumb: () => "支出 / 分析",
    logo: <Wallet aria-hidden />
  },
  receipts: {
    name: "票据",
    crumb: (sub) => `支出 / 票据${sub ? ` / ${sub}` : ""}`,
    logo: <ReceiptText aria-hidden />
  }
};

export function ExpensesHeader({
  kind,
  month,
  uploader,
  manualExpense,
  showBudgetSettings = true,
  csvExport,
  onReload
}: Props & { onReload: () => Promise<void> }) {
  const copy = COPY[kind];
  const tz = csvExport?.tz ?? "Asia/Shanghai";

  const showWorkbar = Boolean(uploader || manualExpense || csvExport);

  return (
    <>
      <header className="exp-shell__header">
        <div className="exp-shell__brand">
          <div className="exp-shell__logo">{copy.logo}</div>
          <div>
            <div className="exp-shell__name">{copy.name}</div>
            <div className="exp-shell__crumb">{copy.crumb(null)}</div>
          </div>
        </div>
        {showBudgetSettings ? (
          <div className="exp-shell__actions">
            <BudgetSettings month={month} onSaved={() => void onReload()} />
          </div>
        ) : null}
        {showWorkbar ? (
          <div className="exp-workbar">
            {uploader ? (
              <ReceiptUploader
                compact
                hint="最多 2 张，失败会进入重试队列"
                maxBytesPerFile={8 * 1024 * 1024}
                maxFiles={2}
                onUpload={uploader.onUpload}
              />
            ) : null}
            {manualExpense ? (
              <button
                className="exp-workbar__button"
                onClick={manualExpense.onOpen}
                type="button"
              >
                <Plus aria-hidden />
                记一笔
              </button>
            ) : null}
            {csvExport ? (
              <a
                className="exp-workbar__button"
                href={`/api/expenses/export?format=csv&month=${encodeURIComponent(csvExport.month)}&tz=${encodeURIComponent(tz)}`}
              >
                导出 CSV
              </a>
            ) : null}
          </div>
        ) : null}
      </header>
      {manualExpense ? (
        <ManualExpensePanel
          busy={manualExpense.busy}
          onClose={manualExpense.onClose}
          onSave={manualExpense.onSave}
          open={manualExpense.open}
        />
      ) : null}
    </>
  );
}