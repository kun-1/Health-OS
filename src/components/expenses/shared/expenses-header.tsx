"use client";

/**
 * Shared header for the /expenses and /expenses/receipts module pages.
 *
 * - /expenses: pass `showUploader={false}` (analysis page, no need to
 *   land a new receipt mid-analysis).
 * - /expenses/receipts: pass `showUploader={true}` and an `onUpload`
 *   handler so the user can drop new receipts without leaving the page.
 *
 * The brand text and crumb render from the `kind` prop so the two pages
 * stay visually consistent without each having to remember to update the
 * copy in two places.
 */

import type { ReactNode } from "react";
import { Plus, ReceiptText, Wallet } from "lucide-react";

import { BudgetSettings } from "../budget-settings";
import { ManualExpensePanel } from "../manual-expense-panel";
import { ReceiptUploader } from "../receipt-uploader";

import "../expenses.css";

export type HeaderKind = "expenses" | "receipts";

type Props = {
  kind: HeaderKind;
  month: string;
  /** Receipt uploader slot. Omit to hide the uploader entirely. */
  uploader?: {
    onUpload: (formData: FormData) => Promise<void> | void;
  };
  manualExpense: {
    open: boolean;
    busy: boolean;
    onOpen: () => void;
    onClose: () => void;
    onSave: Parameters<typeof ManualExpensePanel>[0]["onSave"];
  };
  onReload: () => Promise<void>;
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

export function ExpensesHeader({ kind, month, uploader, manualExpense, onReload }: Props) {
  const copy = COPY[kind];

  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"
      : "Asia/Shanghai";

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
        <div className="exp-shell__actions">
          <BudgetSettings month={month} onSaved={() => void onReload()} />
        </div>
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
          <button
            className="exp-workbar__button"
            onClick={manualExpense.onOpen}
            type="button"
          >
            <Plus aria-hidden />
            记一笔
          </button>
          <a
            className="exp-workbar__button"
            href={`/api/expenses/export?format=csv&month=${encodeURIComponent(month)}&tz=${encodeURIComponent(tz)}`}
          >
            导出 CSV
          </a>
        </div>
      </header>
      <ManualExpensePanel
        busy={manualExpense.busy}
        onClose={manualExpense.onClose}
        onSave={manualExpense.onSave}
        open={manualExpense.open}
      />
    </>
  );
}