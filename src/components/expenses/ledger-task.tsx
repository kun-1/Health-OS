"use client";

import { useMemo } from "react";

import { formatMoney } from "@/lib/expenses/money";
import type {
  ExpenseAnalytics,
  ExpenseTransaction,
  ExtractedExpenseReceipt
} from "@/lib/expenses/types";

import { TransactionCard } from "./transaction-card";
import { transactionToExtracted } from "./shared/task-helpers";

type LedgerDateGroup = {
  key: string;
  label: string;
  transactions: ExpenseAnalytics["recent_transactions"];
  totals: string;
};

function ledgerDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10) || "unknown";
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function ledgerDayLabel(key: string) {
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "long",
    weekday: "short"
  }).format(date);
}

function groupLedgerTransactions(transactions: ExpenseAnalytics["recent_transactions"]): LedgerDateGroup[] {
  const map = new Map<string, ExpenseAnalytics["recent_transactions"]>();
  for (const transaction of transactions) {
    const key = ledgerDayKey(transaction.purchased_at);
    const list = map.get(key) ?? [];
    list.push(transaction);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([key, list]) => {
    const totalsByCurrency = new Map<string, number>();
    for (const transaction of list) {
      totalsByCurrency.set(transaction.currency, (totalsByCurrency.get(transaction.currency) ?? 0) + transaction.total_amount);
    }
    const totals = Array.from(totalsByCurrency.entries())
      .map(([currency, amount]) => formatMoney(amount, currency))
      .join(" / ");
    return {
      key,
      label: ledgerDayLabel(key),
      transactions: list,
      totals
    };
  });
}

export function LedgerTask({
  analytics,
  deletePosted,
  setTransactionDrafts,
  transactionDrafts,
  updatePosted
}: {
  analytics: ExpenseAnalytics;
  deletePosted: (transaction: ExpenseTransaction) => Promise<void>;
  setTransactionDrafts: React.Dispatch<React.SetStateAction<Record<number, ExtractedExpenseReceipt>>>;
  transactionDrafts: Record<number, ExtractedExpenseReceipt>;
  updatePosted: (transaction: ExpenseTransaction) => Promise<void>;
}) {
  const groups = useMemo(() => groupLedgerTransactions(analytics.recent_transactions), [analytics.recent_transactions]);

  return (
    <section className="exp-panel exp-panel--wide">
      <div className="exp-section-head exp-section-head--compact">
        <div>
          <p className="exp-eyebrow">已入账</p>
          <h2>按日期对账，可展开编辑或删除</h2>
        </div>
      </div>
      <div className="exp-date-groups">
        {groups.length === 0 ? (
          <div className="exp-empty exp-card">还没有入账消费</div>
        ) : (
          groups.map((group) => (
            <section className="exp-date-group" key={group.key}>
              <header className="exp-ledger-date-header">
                <div>
                  <strong>{group.label}</strong>
                  <span>{group.key}</span>
                </div>
                <div>
                  <strong>{group.totals}</strong>
                  <span>{group.transactions.length} 笔</span>
                </div>
              </header>
              <div className="exp-real-card-grid exp-real-card-grid--date">
                {group.transactions.map((transaction) => (
                  <TransactionCard
                    draft={transactionDrafts[transaction.id] ?? transactionToExtracted(transaction)}
                    key={transaction.id}
                    onDelete={() => void deletePosted(transaction)}
                    onDraftChange={(next) => setTransactionDrafts((current) => ({ ...current, [transaction.id]: next }))}
                    onSave={() => void updatePosted(transaction)}
                    transaction={transaction}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );
}
