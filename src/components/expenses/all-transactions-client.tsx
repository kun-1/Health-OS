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
import { transactionToExtracted, type ManualExpenseInput } from "./shared/task-helpers";
import { useSelectedMonth } from "@/components/shared/use-selected-month";
import "./expenses.css";

const PAGE_SIZE = 50;

type QuickFilter = { id: string; label: string; match: (category: string) => boolean };

const QUICK_FILTERS: QuickFilter[] = [
  { id: "all", label: "全部", match: () => true },
  { id: "food", label: "饮食", match: (c) => ["食物", "外食", "饮料/咖啡"].includes(c) },
  { id: "transport", label: "出行", match: (c) => c === "交通" },
  { id: "daily", label: "日用", match: (c) => ["日用品", "清洁用品", "个人护理"].includes(c) },
  { id: "other", label: "其他", match: (c) => !["食物", "外食", "饮料/咖啡", "交通", "日用品", "清洁用品", "个人护理"].includes(c) }
];

type FullListTransaction = ExpenseTransaction & {
  receipt_image_path?: string | null;
  receipt_thumbnail_path?: string | null;
};

type LoadResult = { rows?: FullListTransaction[]; transactions?: FullListTransaction[]; total: number };

export function AllTransactionsClient() {
  const month = useSelectedMonth();
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    []
  );
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
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const orderedItems = useMemo<BulkItem[]>(
    () => rows.map((t) => ({ id: t.id, kind: "transaction" as const })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const filter = QUICK_FILTERS.find((f) => f.id === activeFilter) ?? QUICK_FILTERS[0];
    return rows.filter((t) => filter.match(t.items[0]?.category_zh ?? "其他"));
  }, [rows, activeFilter]);

  const activeFilterLabel = QUICK_FILTERS.find((f) => f.id === activeFilter)?.label ?? "全部";

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

      <div className="exp-quick-filters" role="tablist" aria-label="类目快捷过滤">
        {QUICK_FILTERS.map((filter) => (
          <button
            aria-selected={activeFilter === filter.id}
            className={`exp-quick-filter ${activeFilter === filter.id ? "exp-quick-filter--active" : ""}`}
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            role="tab"
            type="button"
          >
            {filter.label}
          </button>
        ))}
        <span className="exp-quick-filter__hint">
          当前：{activeFilterLabel} · {filteredRows.length} 笔
        </span>
      </div>

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
          {filteredRows.length === 0 && !loading ? (
            <div className="exp-empty exp-card">
              <div className="exp-empty__icon" aria-hidden>
                📒
              </div>
              <div>该过滤条件下没有交易</div>
            </div>
          ) : (
            filteredRows.map((transaction) => (
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
