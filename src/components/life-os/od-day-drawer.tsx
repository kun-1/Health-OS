"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useODToast } from "./od-toast";
import "./od-home.css";

/** Minimal projection of a transaction used by the day drawer. Keeps
 *  the component decoupled from ExpenseAnalytics's full shape so the
 *  parent decides what to feed in. */
export type ODTransactionRow = {
  id: number;
  /** ISO date (YYYY-MM-DD) — used to group into the calendar. */
  day: string;
  /** Display title (e.g. merchant name). */
  title: string;
  /** Subtitle (e.g. category or "票据 · 待确认"). */
  subtitle: string;
  /** "receipt" | "transaction" | "recurring" — drives scope filter. */
  kind: "receipt" | "transaction" | "recurring";
  /** Amount in major units (yuan). Null for non-spend rows. */
  amount: number | null;
  /** Currency code (e.g. "CNY"). */
  currency: string;
  /** Whether the row is already posted (confirmed) or pending. */
  status: "pending" | "confirmed" | "paused";
  /** Whether the row is excluded from the budget. */
  excluded: boolean;
};

type Props = {
  /** Currently open day, or null when the drawer is closed. */
  openDay: string | null;
  /** All rows for the active month; the drawer filters by `day`. */
  rows: ReadonlyArray<ODTransactionRow>;
  /** Called when the user dismisses the drawer. */
  onClose: () => void;
  /** Called when the user asks to refresh rows (e.g. after a mutation). */
  onMutated?: () => void;
  /** Selection state lifted to the parent so cluster actions can read it. */
  selected: Set<number>;
  onSelectionChange: (next: Set<number>) => void;
};

const TYPE_LABEL: Record<ODTransactionRow["kind"], string> = {
  receipt: "票据",
  transaction: "交易",
  recurring: "定期"
};

const STATUS_LABEL: Record<ODTransactionRow["status"], string> = {
  pending: "待确认",
  confirmed: "已入账",
  paused: "已暂停"
};

function formatAmount(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  return `${currency === "CNY" ? "¥" : ""}${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dayOfWeekZh(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return "";
  const wd = ["日", "一", "二", "三", "四", "五", "六"][new Date(y, m - 1, d).getDay()];
  return `周${wd}`;
}

function daySpend(rows: ReadonlyArray<ODTransactionRow>): number {
  return rows.reduce((acc, r) => acc + (typeof r.amount === "number" && !r.excluded ? r.amount : 0), 0);
}

/** Day-detail drawer per the OD reference. Opens when the calendar emits
 *  a day click. Each row is selectable for batch actions; per-row
 *  actions call the real expense / receipt endpoints where they exist,
 *  and fall back to a toast for actions without a backend (edit, close). */
export function ODDayDrawer({ openDay, rows, onClose, onMutated, selected, onSelectionChange }: Props) {
  const router = useRouter();
  const toast = useODToast();
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openDay && !dialog.open) dialog.showModal();
    else if (!openDay && dialog.open) dialog.close();
  }, [openDay]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = () => onClose();
    dialog.addEventListener("close", handler);
    return () => dialog.removeEventListener("close", handler);
  }, [onClose]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    // Native <dialog> reports the dialog element as the click target when the user
    // clicks outside its content rect — that's our backdrop-click signal.
    if (event.target === event.currentTarget) onClose();
  }

  const dayRows = useMemo(
    () => (openDay ? rows.filter((r) => r.day === openDay) : []),
    [openDay, rows]
  );

  // Drop day-specific ids from the selection when the day changes /
  // drawer closes; selection outside the current day persists so cluster
  // actions can still operate on previously-selected rows.
  useEffect(() => {
    if (!openDay) return;
    const daySet = new Set(dayRows.map((r) => r.id));
    const next = new Set<number>();
    for (const id of selected) {
      if (!daySet.has(id)) next.add(id);
    }
    if (next.size !== selected.size) onSelectionChange(next);
    // We intentionally don't re-run on `selected` to avoid feedback loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDay]);

  // Close-on-Escape is handled natively by <dialog>; the `close` event
  // listener above fans it into React's onClose.

  if (!openDay) return null;

  const total = dayRows.length;
  // Count how many of the day's rows are currently in the global selection.
  let daySel = 0;
  for (const r of dayRows) if (selected.has(r.id)) daySel += 1;
  const spend = daySpend(dayRows);

  const allSelected = total > 0 && daySel === total;

  function toggleOne(id: number, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  }
  function toggleAll(checked: boolean) {
    const next = new Set(selected);
    for (const r of dayRows) {
      if (checked) next.add(r.id);
      else next.delete(r.id);
    }
    onSelectionChange(next);
  }

  async function confirmOne(id: number, kind: ODTransactionRow["kind"]) {
    try {
      setBusy(true);
      if (kind === "receipt") {
        toast.show("票据确认请到 /expenses/transactions 走完整流程");
        router.push("/expenses/transactions");
      } else {
        // Transactions have an exclusion toggle; treat "confirm" as
        // "ensure included" by PATCHing excludedFromBudget = false.
        const res = await fetch(`/api/expenses/transactions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excludedFromBudget: false })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.show("已入账");
        onMutated?.();
      }
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function excludeOne(id: number, kind: ODTransactionRow["kind"], next: boolean) {
    if (kind === "receipt") {
      // Receipts don't have an exclusion endpoint; redirect user.
      toast.show("票据不计入预算请到 /expenses/transactions 设置");
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(`/api/expenses/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedFromBudget: next })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.show(next ? "已标记不计入预算" : "已重新计入预算");
      onMutated?.();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteOne(id: number, kind: ODTransactionRow["kind"], title: string) {
    if (typeof window !== "undefined" && !window.confirm(`删除 ${title}?`)) return;
    try {
      setBusy(true);
      const url =
        kind === "receipt"
          ? `/api/expenses/receipts/${id - 1_000_000}`
          : `/api/expenses/transactions/${id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.show("已删除");
      onMutated?.();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function batchConfirm() {
    if (daySel === 0) {
      toast.show("请先勾选当天条目");
      return;
    }
    try {
      setBusy(true);
      let n = 0;
      for (const row of dayRows) {
        if (!selected.has(row.id)) continue;
        if (row.kind === "receipt") continue; // requires full review flow
        if (row.excluded) continue;
        const res = await fetch(`/api/expenses/transactions/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excludedFromBudget: false })
        });
        if (res.ok) n += 1;
      }
      toast.show(`已批量确认 ${n} 项`);
      onMutated?.();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "批量操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function batchDelete() {
    if (daySel === 0) {
      toast.show("请先勾选当天条目");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(`批量删除 ${daySel} 项?`)) return;
    try {
      setBusy(true);
      let n = 0;
      for (const row of dayRows) {
        if (!selected.has(row.id)) continue;
        const url =
          row.kind === "receipt"
            ? `/api/expenses/receipts/${row.id - 1_000_000}`
            : `/api/expenses/transactions/${row.id}`;
        const res = await fetch(url, { method: "DELETE" });
        if (res.ok) n += 1;
      }
      toast.show(`已批量删除 ${n} 项`);
      onMutated?.();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "批量操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      aria-labelledby="od-drawer-title"
      className="od-drawer"
      onClick={handleBackdropClick}
      ref={dialogRef}
    >
      <div className="od-drawer-head">
        <div className="od-drawer-title" id="od-drawer-title">
          {openDay} · {dayOfWeekZh(openDay)} · {total} 项
        </div>
        <button
          aria-label="关闭"
          className="od-drawer-close"
          onClick={onClose}
          type="button"
        >
          ✕
        </button>
      </div>
        <div className="od-drawer-batch">
          <label className="od-drawer-select-all">
            <input
              checked={allSelected}
              onChange={(e) => toggleAll(e.target.checked)}
              type="checkbox"
            />
            全选当天条目
          </label>
          <div className="od-drawer-batch-actions">
            <button
              className="primary"
              disabled={busy || daySel === 0}
              onClick={batchConfirm}
              type="button"
            >
              批量确认入账
            </button>
            <button
              className="danger"
              disabled={busy || daySel === 0}
              onClick={batchDelete}
              type="button"
            >
              批量删除
            </button>
          </div>
        </div>
        <div className="od-drawer-body">
          {dayRows.length === 0 ? (
            <div className="od-drawer-empty">当天没有条目</div>
          ) : (
            dayRows.map((row) => {
              const checked = selected.has(row.id);
              return (
                <div
                  className={`od-drawer-row${checked ? " selected" : ""}`}
                  data-id={row.id}
                  key={row.id}
                >
                  <div className="od-drawer-row-head">
                    <input
                      checked={checked}
                      onChange={(e) => toggleOne(row.id, e.target.checked)}
                      type="checkbox"
                    />
                    <span className="od-drawer-row-project">{row.title}</span>
                    {row.amount != null ? (
                      <span className="od-drawer-row-amount">
                        {formatAmount(row.amount, row.currency)}
                      </span>
                    ) : null}
                  </div>
                  <div className="od-drawer-row-meta">
                    <span>
                      {TYPE_LABEL[row.kind]}
                      {row.subtitle ? ` · ${row.subtitle}` : ""}
                    </span>
                    <span>{STATUS_LABEL[row.status]}</span>
                    {row.excluded ? <span>不计入</span> : null}
                  </div>
                  <div className="od-drawer-row-actions">
                    <button
                      disabled={busy}
                      onClick={() => confirmOne(row.id, row.kind)}
                      type="button"
                    >
                      确认入账
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => excludeOne(row.id, row.kind, !row.excluded)}
                      type="button"
                    >
                      不计入预算
                    </button>
                    <button
                      onClick={() => {
                        toast.show("行级编辑请到 /expenses/transactions 详情页");
                        router.push(`/expenses/transactions?month=${openDay.slice(0, 7)}`);
                      }}
                      type="button"
                    >
                      编辑
                    </button>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => deleteOne(row.id, row.kind, row.title)}
                      type="button"
                    >
                      删除
                    </button>
                    <button
                      className="ghost"
                      onClick={onClose}
                      type="button"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="od-drawer-foot">
          共 {total} 项 · 已选 {daySel} 项 · 当日合计 {formatAmount(spend, "CNY")}
        </div>
    </dialog>
  );
}
