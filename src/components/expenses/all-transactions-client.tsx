"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ExpenseTransaction, ExtractedExpenseReceipt } from "@/lib/expenses/types";

import { BulkSelectionProvider, type BulkItem } from "./bulk-selection";
import { BulkToolbar } from "./bulk-toolbar";
import { TransactionCard } from "./transaction-card";

const PAGE_SIZE = 50;

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type FullListTransaction = ExpenseTransaction & {
  receipt_image_path?: string | null;
  receipt_thumbnail_path?: string | null;
};

type LoadResult = { rows?: FullListTransaction[]; transactions?: FullListTransaction[]; total: number };

function transactionToExtracted(transaction: ExpenseTransaction): ExtractedExpenseReceipt {
  return {
    merchant_name: transaction.merchant_name,
    purchased_at: transaction.purchased_at,
    currency: transaction.currency,
    subtotal_amount: transaction.subtotal_amount,
    total_amount: transaction.total_amount,
    tax_amount: transaction.tax_amount,
    processing_fee: transaction.processing_fee,
    delivery_fee: transaction.delivery_fee,
    delivery_discount: transaction.delivery_discount,
    discount_amount: transaction.discount_amount,
    confidence: 1,
    model_suggested_auto_post: true,
    needs_review_reasons: [],
    recognition_note: null,
    user_note: transaction.notes,
    items: transaction.items.map((item) => ({
      name_raw: item.name_raw,
      name_zh: item.name_zh,
      category_zh: item.category_zh,
      quantity: item.quantity,
      spec_text: item.spec_text,
      food_amount_value: item.food_amount_value,
      food_amount_unit: item.food_amount_unit,
      unit_price: item.unit_price,
      discounted_unit_price: item.discounted_unit_price,
      amount: item.amount,
      confidence: item.confidence,
      notes: item.notes
    }))
  };
}

export function AllTransactionsClient() {
  const [month, setMonth] = useState<string>(currentMonth());
  const [rows, setRows] = useState<FullListTransaction[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Wave 3 bulk: status banner for the historical page (it didn't have one
  // before). Reuses the same banner style as the home page.
  const [message, setMessage] = useState<string>("");

  // Wave 3 bulk: ordered list of currently visible transactions, used by the
  // provider to compute shift-click ranges. Pagination beyond the current
  // page isn't part of the range — the user would have to navigate first.
  const orderedItems = useMemo<BulkItem[]>(
    () => rows.map((t) => ({ id: t.id, kind: "transaction" as const })),
    [rows]
  );

  const load = useCallback(async (nextOffset: number) => {
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
        Object.fromEntries((data.rows ?? data.transactions ?? []).map((transaction) => [transaction.id, transactionToExtracted(transaction)]))
      );
      setTotal(data.total);
      setOffset(nextOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load(0);
  }, [load]);

  // Wave 2 fix: all page delete
  async function handleDelete(transactionId: number) {
    if (!window.confirm("确认删除这笔交易？")) return;
    try {
      const response = await fetch(`/api/expenses/transactions/${transactionId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
      await load(offset);
    } catch (err) {
      alert(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
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

  return (
    <div className="exp">
      <header className="exp-header">
        <div className="exp-header__brand">
          <span className="exp-header__mark" aria-hidden>
            <svg fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
              <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </span>
          <div>
            <h1 className="exp-header__title">全部已入账</h1>
            <p className="exp-header__subtitle">Wave 2 feature: full list · 共 {total} 笔</p>
          </div>
        </div>
        <div className="exp-header__right">
          <label className="exp-month">
            <span aria-hidden>
              <svg fill="none" height="15" viewBox="0 0 24 24" width="15" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </span>
            <input
              onChange={(event) => setMonth(event.target.value)}
              type="month"
              value={month}
            />
          </label>
          <a className="exp-btn exp-btn--ghost exp-btn--sm" href="/expenses">
            ← 返回概览
          </a>
        </div>
      </header>

      {error ? <div className="exp-banner exp-banner--error">{error}</div> : null}
      {message ? <div className="exp-banner exp-banner--ok">{message}</div> : null}

      <div className="exp-card__row" style={{ background: "var(--exp-surface)", border: "1px solid var(--exp-border)", borderRadius: "var(--exp-radius)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

      {/* Wave 3 bulk: provider + toolbar. "all" mode skips the confirm
          button — the historical view doesn't bulk-confirm old receipts. */}
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
              <div className="exp-empty__icon" aria-hidden>📒</div>
              <div>该月份还没有入账消费</div>
            </div>
          ) : (
            rows.map((transaction) => (
              <TransactionCard
                draft={drafts[transaction.id] ?? transactionToExtracted(transaction)}
                key={transaction.id}
                onDelete={() => void handleDelete(transaction.id)}
                onDraftChange={(next) => setDrafts((current) => ({ ...current, [transaction.id]: next }))}
                onSave={() => void handleSave(transaction)}
                transaction={transaction}
              />
            ))
          )}
        </div>
      </BulkSelectionProvider>
    </div>
  );
}
