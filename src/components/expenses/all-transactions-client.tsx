"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Wallet } from "lucide-react";

import { formatMoney } from "@/lib/expenses/money";
import type { ExpenseTransaction, ExtractedExpenseReceipt } from "@/lib/expenses/types";

import { BulkSelectionProvider, type BulkItem } from "./bulk-selection";
import { BulkToolbar } from "./bulk-toolbar";
import { ConfirmDialog } from "./confirm-dialog";
import { ManualExpensePanel } from "./manual-expense-panel";
import { TransactionCard } from "./transaction-card";
import { ExpenseBanners } from "./shared/expense-banners";
import { currentMonth, transactionToExtracted, type ManualExpenseInput } from "./shared/task-helpers";
import "./expenses.css";

const PAGE_SIZE = 50;

type FullListTransaction = ExpenseTransaction & {
  receipt_image_path?: string | null;
  receipt_thumbnail_path?: string | null;
};

type LoadResult = { rows?: FullListTransaction[]; transactions?: FullListTransaction[]; total: number };

export function AllTransactionsClient() {
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    []
  );
  const [month, setMonth] = useState<string>(currentMonth());
  const [rows, setRows] = useState<FullListTransaction[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    message: string;
    run: () => Promise<void>;
  } | null>(null);

  const orderedItems = useMemo<BulkItem[]>(
    () => rows.map((t) => ({ id: t.id, kind: "transaction" as const })),
    [rows]
  );

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const monthParam = month ? `&month=${encodeURIComponent(month)}` : "";
        const response = await fetch(
          `/api/expenses/transactions?offset=${nextOffset}&limit=${PAGE_SIZE}${monthParam}`
        );
        if (!response.ok) {
          setError(`服务器返回 ${response.status}`);
          return;
        }
        const data = (await response.json()) as LoadResult;
        setRows(data.rows ?? data.transactions ?? []);
        setDrafts(
          Object.fromEntries(
            (data.rows ?? data.transactions ?? []).map((transaction) => [
              transaction.id,
              transactionToExtracted(transaction)
            ])
          )
        );
        setTotal(data.total);
        setOffset(nextOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [month]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  async function createManualExpense(input: ManualExpenseInput) {
    setError(null);
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
      await load(offset);
    } finally {
      setManualBusy(false);
    }
  }

  async function handleDelete(transactionId: number) {
    setPendingDelete({
      message: "确认删除这笔交易？",
      run: async () => {
        try {
          const response = await fetch(`/api/expenses/transactions/${transactionId}`, {
            method: "DELETE"
          });
          if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
          await load(offset);
        } catch (err) {
          setError(`删除失败：${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
  }

  async function handleSave(transaction: FullListTransaction) {
    const draft = drafts[transaction.id] ?? transactionToExtracted(transaction);
    try {
      const response = await fetch(`/api/expenses/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted: draft })
      });
      if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
      setMessage(`已更新：${draft.merchant_name ?? transaction.merchant_name}`);
      await load(offset);
    } catch (err) {
      setError(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(total, offset + rows.length);
  const canPrev = offset > 0;
  const canNext = offset + rows.length < total;
  const csvHref = `/api/expenses/export?format=csv&month=${encodeURIComponent(month)}&tz=${encodeURIComponent(tz)}`;

  return (
    <div className="exp-analytics">
      <header className="exp-shell__header">
        <div className="exp-shell__brand">
          <div className="exp-shell__logo">
            <Wallet aria-hidden />
          </div>
          <div>
            <div className="exp-shell__name">流水</div>
            <div className="exp-shell__crumb">支出 / 全部已入账交易</div>
          </div>
        </div>
        <div className="exp-shell__actions">
          <label className="exp-month">
            <span aria-hidden>
              <svg fill="none" height="15" viewBox="0 0 24 24" width="15" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </span>
            <input onChange={(event) => setMonth(event.target.value)} type="month" value={month} />
          </label>
          <a className="exp-btn exp-btn--secondary exp-btn--sm" href={csvHref}>
            导出 CSV
          </a>
          <button
            className="exp-btn exp-btn--primary exp-btn--sm"
            onClick={() => setManualOpen(true)}
            type="button"
          >
            <Plus aria-hidden />
            记一笔
          </button>
        </div>
      </header>

      <ExpenseBanners error={error ?? ""} loadError={null} message={message} onRetry={() => void load(offset)} />

      <div
        className="exp-card__row"
        style={{
          background: "var(--exp-surface)",
          border: "1px solid var(--exp-border)",
          borderRadius: "var(--exp-radius)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <span className="exp-card__meta">
          第 {start}-{end} 笔 / 共 {total} 笔
          {loading ? " · 加载中..." : ""}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="exp-btn exp-btn--secondary exp-btn--sm"
            disabled={!canPrev || loading}
            onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
            type="button"
          >
            上一页
          </button>
          <button
            className="exp-btn exp-btn--secondary exp-btn--sm"
            disabled={!canNext || loading}
            onClick={() => void load(offset + PAGE_SIZE)}
            type="button"
          >
            下一页
          </button>
        </div>
      </div>

      <BulkSelectionProvider clearKey={month} items={orderedItems}>
        <BulkToolbar
          mode="all"
          onError={(msg) => setError(msg)}
          onMessage={setMessage}
          receiptDrafts={{}}
          reload={() => load(offset)}
        />
        <div className="exp-col">
          {rows.length === 0 && !loading ? (
            <div className="exp-empty exp-card">
              <div className="exp-empty__icon" aria-hidden>
                📒
              </div>
              <div>该月份还没有入账消费</div>
            </div>
          ) : (
            rows.map((transaction) => (
              <TransactionCard
                draft={drafts[transaction.id] ?? transactionToExtracted(transaction)}
                key={transaction.id}
                onDelete={() => void handleDelete(transaction.id)}
                onDraftChange={(next) =>
                  setDrafts((current) => ({ ...current, [transaction.id]: next }))
                }
                onSave={() => void handleSave(transaction)}
                transaction={transaction}
              />
            ))
          )}
        </div>
      </BulkSelectionProvider>

      <ManualExpensePanel
        busy={manualBusy}
        onClose={() => setManualOpen(false)}
        onSave={createManualExpense}
        open={manualOpen}
      />

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
        title="删除交易"
      />
    </div>
  );
}
