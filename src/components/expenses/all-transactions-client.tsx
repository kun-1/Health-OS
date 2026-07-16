"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BusFront,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  LayoutList,
  PenLine,
  ReceiptText,
  RotateCw,
  ScanLine,
  ShoppingBasket,
  Trash2,
  Utensils,
  Wallet,
  type LucideIcon
} from "lucide-react";

import { formatMoney } from "@/lib/expenses/money";
import type {
  ExpenseReceiptJob,
  ExpenseReceiptSummary,
  ExpenseTransaction,
  ExtractedExpenseReceipt
} from "@/lib/expenses/types";

import { BulkSelectionProvider, type BulkItem } from "./bulk-selection";
import { BulkToolbar } from "./bulk-toolbar";
import { ConfirmDialog } from "./confirm-dialog";
import { ManualExpensePanel } from "./manual-expense-panel";
import { PendingReceiptCard } from "./pending-card";
import { ReceiptUploader } from "./receipt-uploader";
import { TransactionCard } from "./transaction-card";
import { RecurringManagerClient } from "./recurring-manager-client";
import { ExpenseBanners } from "./shared/expense-banners";
import {
  transactionToExtracted,
  uploadTimingSummary,
  type ManualExpenseInput,
  type UploadFailure
} from "./shared/task-helpers";
import { useExpenseData } from "./shared/use-expense-data";
import { useSelectedMonth } from "@/components/shared/use-selected-month";
import "./expenses.css";

const PAGE_SIZE = 50;

type QuickFilter = { id: string; label: string; icon: LucideIcon; match: (category: string) => boolean };
type WorkspaceView = "ledger" | "recurring";

function initialWorkspaceView(): WorkspaceView {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "recurring") {
    return "recurring";
  }
  return "ledger";
}

function LedgerWorkspaceTabs({ view, onChange }: { view: WorkspaceView; onChange: (next: WorkspaceView) => void }) {
  return (
    <div className="exp-workspace-tabs" role="tablist" aria-label="账单工作区视图">
      <button
        aria-selected={view === "ledger"}
        className={view === "ledger" ? "is-active" : ""}
        onClick={() => onChange("ledger")}
        role="tab"
        type="button"
      >
        <ReceiptText aria-hidden />
        账单
      </button>
      <button
        aria-selected={view === "recurring"}
        className={view === "recurring" ? "is-active" : ""}
        onClick={() => onChange("recurring")}
        role="tab"
        type="button"
      >
        <CalendarClock aria-hidden />
        定期
      </button>
    </div>
  );
}

const QUICK_FILTERS: QuickFilter[] = [
  { id: "all", label: "全部", icon: LayoutList, match: () => true },
  { id: "food", label: "餐饮", icon: Utensils, match: (c) => ["食物", "外食", "饮料/咖啡"].includes(c) },
  { id: "transport", label: "交通", icon: BusFront, match: (c) => c === "交通" },
  { id: "daily", label: "日用", icon: ShoppingBasket, match: (c) => ["日用品", "清洁用品", "个人护理"].includes(c) },
  { id: "other", label: "其他", icon: Ellipsis, match: (c) => !["食物", "外食", "饮料/咖啡", "交通", "日用品", "清洁用品", "个人护理"].includes(c) }
];

type LedgerDateGroup = {
  key: string;
  label: string;
  totalLabel: string;
  transactions: FullListTransaction[];
};

type FullListTransaction = ExpenseTransaction & {
  receipt_image_path?: string | null;
  receipt_thumbnail_path?: string | null;
};

type LoadResult = { rows?: FullListTransaction[]; transactions?: FullListTransaction[]; total: number };

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
  const now = new Date();
  const todayKey = ledgerDayKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = ledgerDayKey(yesterday.toISOString());
  if (key === todayKey) return "今天";
  if (key === yesterdayKey) return "昨天";
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "long",
    weekday: "short"
  }).format(date);
}

function groupLedgerTransactions(transactions: FullListTransaction[]): LedgerDateGroup[] {
  const map = new Map<string, FullListTransaction[]>();
  for (const transaction of transactions) {
    const key = ledgerDayKey(transaction.purchased_at);
    const list = map.get(key) ?? [];
    list.push(transaction);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([key, list]) => {
    const totalsByCurrency = new Map<string, number>();
    for (const transaction of list) {
      totalsByCurrency.set(
        transaction.currency,
        (totalsByCurrency.get(transaction.currency) ?? 0) + transaction.total_amount
      );
    }
    return {
      key,
      label: ledgerDayLabel(key),
      totalLabel: Array.from(totalsByCurrency.entries())
        .map(([currency, amount]) => formatMoney(amount, currency))
        .join(" / "),
      transactions: list
    };
  });
}

function jobStatusLabel(status: ExpenseReceiptJob["status"]) {
  if (status === "queued") return "等待识别";
  if (status === "processing") return "识别中";
  if (status === "failed") return "识别失败";
  if (status === "dead") return "已达上限";
  return "已完成";
}

function shortJobError(message: string | null) {
  if (!message) return "后台会自动重试，也可以手动处理。";
  if (message.includes("timeout") || message.includes("aborted")) return "识别超时，可立即重试。";
  if (message.includes("401") || message.includes("403")) return "鉴权失败，请检查 OCR 配置。";
  return message;
}

export function AllTransactionsClient() {
  const month = useSelectedMonth();
  const {
    analytics,
    loadError,
    pendingDrafts,
    setPendingDrafts,
    reload: reloadExpenseData
  } = useExpenseData(month);
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
    title: string;
    message: string;
    run: () => Promise<void>;
  } | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(initialWorkspaceView);

  const changeWorkspaceView = useCallback((next: WorkspaceView) => {
    setWorkspaceView(next);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (next === "recurring") params.set("view", "recurring");
    else params.delete("view");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  const orderedItems = useMemo<BulkItem[]>(
    () => rows.map((t) => ({ id: t.id, kind: "transaction" as const })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const filter = QUICK_FILTERS.find((f) => f.id === activeFilter) ?? QUICK_FILTERS[0];
    return rows.filter((t) => filter.match(t.items[0]?.category_zh ?? "其他"));
  }, [rows, activeFilter]);

  const groupedRows = useMemo(() => groupLedgerTransactions(filteredRows), [filteredRows]);

  const activeFilterLabel = QUICK_FILTERS.find((f) => f.id === activeFilter)?.label ?? "全部";
  const hasReceiptWork =
    (analytics?.pending_receipts.length ?? 0) > 0 || (analytics?.receipt_jobs.length ?? 0) > 0;

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

  const reloadWorkspace = useCallback(async () => {
    await Promise.all([reloadExpenseData(), load(offset)]);
  }, [load, offset, reloadExpenseData]);

  useEffect(() => {
    void load(0);
  }, [load]);

  const uploadReceipt = useCallback(
    async (formData: FormData) => {
      setError(null);
      setMessage("");
      const response = await fetch("/api/expenses/receipts", {
        method: "POST",
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        const existingId = (data as { existingReceiptId?: number }).existingReceiptId;
        setError(
          `已上传过这张图片${typeof existingId === "number" ? ` (receipt #${existingId})` : ""}，请在待处理账单里核对`
        );
        return;
      }
      if (!response.ok) {
        const failures = Array.isArray(data.failures)
          ? `; ${(data.failures as UploadFailure[])
              .map((f) => `${f.filename ?? "图片"}: ${f.error}`)
              .join("; ")}`
          : "";
        setError(data.error ? `票据识别失败: ${data.error}${failures}` : "票据识别失败");
        return;
      }
      const receipts = (data.receipts ?? (data.receipt ? [data.receipt] : [])) as ExpenseReceiptSummary[];
      const failures = (data.failures ?? []) as UploadFailure[];
      const timings = (data.timings ?? []) as Array<{
        filename?: string;
        provider?: string;
        model?: string;
        total_ms?: number;
        ocr_ms?: number;
      }>;
      const jobsCount = Array.isArray(data.jobs) ? (data.jobs as unknown[]).length : 0;
      const summary = receipts.map((r) => `#${r.id} 已处理`).join(", ");
      const failureText = failures.length
        ? `; 失败 ${failures.length} 张: ${failures.map((f) => f.filename ?? "图片").join(", ")}`
        : "";
      const queuedText =
        jobsCount > 0 && receipts.length === 0 ? "; 图片已保存到识别队列，稍后自动重试" : "";
      setMessage(
        `${summary || "识别完成"}${failureText}${queuedText}${uploadTimingSummary(timings, data.total_ms)}`
      );
      await reloadWorkspace();
    },
    [reloadWorkspace]
  );

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
      const totalAmount = input.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
      const label = input.items.length === 1 ? input.items[0]?.item_name : `${input.items.length} 项商品`;
      setMessage(
        `已记入: ${label} ${formatMoney(totalAmount, input.currency ?? "CNY")}`
      );
      await load(offset);
    } finally {
      setManualBusy(false);
    }
  }

  async function handleDelete(transactionId: number) {
    setPendingDelete({
      title: "删除账单",
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

  async function retryDueJobs() {
    const response = await fetch("/api/expenses/receipt-jobs/retry", { method: "POST" });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    setMessage(`已重试 ${data.processed ?? 0} 张票据`);
    await reloadWorkspace();
  }

  async function retryJob(job: ExpenseReceiptJob) {
    setError(null);
    setMessage("");
    const response = await fetch(`/api/expenses/receipt-jobs/${job.id}`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "重试失败");
      return;
    }
    setMessage("receipt" in data ? `队列 #${job.id} 已识别完成` : `队列 #${job.id} 仍未识别成功，稍后会继续重试`);
    await reloadWorkspace();
  }

  async function deleteJob(job: ExpenseReceiptJob) {
    setPendingDelete({
      title: "删除失败图片",
      message: `确认删除失败图片 ${job.original_filename}？本地图片也会一起删除。`,
      run: async () => {
        setError(null);
        setMessage("");
        const response = await fetch(`/api/expenses/receipt-jobs/${job.id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "删除失败");
          return;
        }
        setMessage(`队列 #${job.id} 已删除`);
        await reloadWorkspace();
      }
    });
  }

  async function confirmPending(receipt: ExpenseReceiptSummary) {
    const extracted = pendingDrafts[receipt.id] ?? receipt.extracted;
    setError(null);
    setMessage("");
    const response = await fetch(`/api/expenses/receipts/${receipt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extracted, user_note: extracted.user_note ?? undefined })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "确认失败");
      return;
    }
    setMessage(`票据 #${receipt.id} 已确认入账`);
    await reloadWorkspace();
  }

  async function deletePending(receipt: ExpenseReceiptSummary) {
    setPendingDelete({
      title: "删除待处理票据",
      message: `确认删除票据 #${receipt.id}？本地图片也会一起删除。`,
      run: async () => {
        setError(null);
        setMessage("");
        const response = await fetch(`/api/expenses/receipts/${receipt.id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "删除失败");
          return;
        }
        setMessage(`票据 #${receipt.id} 已删除`);
        await reloadWorkspace();
      }
    });
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
            <div className="exp-shell__name">账单</div>
            <div className="exp-shell__crumb">待处理与已入账</div>
          </div>
        </div>
        <div className="exp-workbar exp-workbar--ledger">
          <ReceiptUploader
            compact
            hint="上传后进入待处理账单"
            maxBytesPerFile={8 * 1024 * 1024}
            maxFiles={2}
            onUpload={uploadReceipt}
          />
          <button
            className="exp-workbar__button exp-workbar__button--primary"
            onClick={() => setManualOpen(true)}
            type="button"
          >
            <PenLine aria-hidden />
            记一笔
          </button>
          <a className="exp-workbar__button exp-workbar__button--quiet" href={csvHref}>
            <Download aria-hidden />
            导出 CSV
          </a>
        </div>
      </header>

      <ExpenseBanners error={error ?? ""} loadError={loadError} message={message} onRetry={() => void reloadWorkspace()} />

      <LedgerWorkspaceTabs onChange={changeWorkspaceView} view={workspaceView} />

      {workspaceView === "recurring" ? <RecurringManagerClient embedded /> : (
        <>

      <section className={`exp-ledger-workbench ${hasReceiptWork ? "" : "exp-ledger-workbench--clear"}`}>
        <div className="exp-section-head exp-section-head--compact">
          <div>
            <p className="exp-eyebrow">待确认票据</p>
            <h2>票据识别结果</h2>
          </div>
          <span className="exp-ledger-workbench__meta">
            {analytics
              ? `${analytics.pending_receipts.length} 张待确认 · ${analytics.receipt_jobs.length} 个队列任务`
              : "加载中"}
          </span>
        </div>
        {analytics ? (
          hasReceiptWork ? (
            <div className="exp-work-queue" aria-label="待处理账单任务">
              {analytics.pending_receipts.map((receipt) => (
                <PendingReceiptCard
                  draft={pendingDrafts[receipt.id] ?? receipt.extracted}
                  key={receipt.id}
                  layout="grid"
                  onCancel={() => setPendingDrafts((current) => ({ ...current, [receipt.id]: receipt.extracted }))}
                  onDelete={() => void deletePending(receipt)}
                  onDraftChange={(next) => setPendingDrafts((current) => ({ ...current, [receipt.id]: next }))}
                  onSave={() => void confirmPending(receipt)}
                  receipt={receipt}
                />
              ))}
              {analytics.receipt_jobs.map((job) => (
                <article className="exp-work-queue__job" key={job.id}>
                  <div className="exp-work-queue__job-icon">
                    <ScanLine aria-hidden />
                  </div>
                  <div className="exp-work-queue__job-body">
                    <div className="exp-work-queue__job-top">
                      <strong>{job.original_filename || `票据任务 #${job.id}`}</strong>
                      <span className="exp-status" data-status={job.status}>
                        {jobStatusLabel(job.status)}
                      </span>
                    </div>
                    <span>{shortJobError(job.error_message)}</span>
                  </div>
                  <div className="exp-work-queue__job-actions">
                    <button
                      className="exp-btn exp-btn--secondary exp-btn--sm"
                      disabled={job.status === "dead"}
                      onClick={() => void retryJob(job)}
                      type="button"
                    >
                      <RotateCw aria-hidden />
                      重试
                    </button>
                    <button
                      className="exp-btn exp-btn--ghost exp-btn--sm"
                      onClick={() => void deleteJob(job)}
                      type="button"
                    >
                      <Trash2 aria-hidden />
                      删除
                    </button>
                  </div>
                </article>
              ))}
              {analytics.receipt_jobs.length > 0 ? (
                <button className="exp-work-queue__retry-all" onClick={() => void retryDueJobs()} type="button">
                  <RotateCw aria-hidden />
                  重试到期任务
                </button>
              ) : null}
            </div>
          ) : (
            <div className="exp-ledger-empty">
              <ScanLine aria-hidden />
              <div>
              <strong>暂无待确认票据</strong>
              <span>上传后会先在这里核对，确认后自动加入账单。</span>
              </div>
            </div>
          )
        ) : (
          <div className="exp-loading-row">
            <span className="exp-state-pulse" aria-hidden />
            <span>正在加载待处理账单…</span>
          </div>
        )}
      </section>

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
            <filter.icon aria-hidden />
            {filter.label}
          </button>
        ))}
        {activeFilter !== "all" ? (
          <span className="exp-quick-filter__hint">筛选后 {activeFilterLabel} · {filteredRows.length} 笔</span>
        ) : null}
      </div>

      <div
        className="exp-card__row exp-ledger-pager"
      >
        <span className="exp-card__meta">
          第 {start}-{end} 笔 / 共 {total} 笔
          {loading ? " · 加载中..." : ""}
        </span>
        <div className="exp-ledger-pager__actions">
          <button
            className="exp-btn exp-btn--secondary exp-btn--sm"
            disabled={!canPrev || loading}
            onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
            type="button"
          >
            <ChevronLeft aria-hidden />
            上一页
          </button>
          <button
            className="exp-btn exp-btn--secondary exp-btn--sm"
            disabled={!canNext || loading}
            onClick={() => void load(offset + PAGE_SIZE)}
            type="button"
          >
            <ChevronRight aria-hidden />
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
        <div className="exp-ledger-groups">
          {groupedRows.length === 0 && !loading ? (
            <div className="exp-empty exp-card">
              <div className="exp-empty__icon" aria-hidden>
                <ReceiptText aria-hidden />
              </div>
              <div>该过滤条件下没有交易</div>
            </div>
          ) : (
            groupedRows.map((group) => (
              <section className="exp-ledger-day" key={group.key}>
                <header className="exp-ledger-day__head">
                  <div>
                    <strong>{group.label}</strong>
                    <span>{group.key}</span>
                  </div>
                  <div>
                    <strong>{group.totalLabel}</strong>
                    <span>{group.transactions.length} 笔</span>
                  </div>
                </header>
                <div className={`exp-ledger-day__grid${group.transactions.length === 1 ? " exp-ledger-day__grid--single" : ""}`}>
                  {group.transactions.map((transaction) => (
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
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </BulkSelectionProvider>

        </>
      )}

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
        title={pendingDelete?.title ?? "确认删除"}
      />
    </div>
  );
}
