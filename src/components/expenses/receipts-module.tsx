"use client";

/**
 * `/expenses/receipts` module — the records processing page.
 *
 * Combines two views from the legacy ExpensesClient:
 *   - ReceiptsTask: pending receipt review + OCR queue (the receipts
 *     task from the old dashboard's "记录处理" pill).
 *   - LedgerTask: posted transactions grouped by date, editable.
 *
 * The OCR workbar (upload / manual entry / CSV export) and the budget
 * settings stay reachable from the same header so this page can be
 * the one-stop shop for "things to process".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ReceiptText } from "lucide-react";

import { formatMoney } from "@/lib/expenses/money";
import { getStoredBudgetCents, getStoredPrimaryCurrency } from "@/lib/expenses/settings";
import type {
  ExpenseAnalytics,
  ExpenseReceiptJob,
  ExpenseReceiptSummary,
  ExpenseTransaction,
  ExtractedExpenseReceipt
} from "@/lib/expenses/types";

import {
  currentMonth,
  formatUtcOffsetForClient,
  LedgerTask,
  LoadingPanel as ExpenseLoadingPanel,
  ReceiptsTask,
  transactionToExtracted,
  uploadTimingSummary,
  type LoadError as ExpenseLoadError,
  type ManualExpenseInput,
  type UploadFailure
} from "./expenses-client";
import { BudgetSettings } from "./budget-settings";
import { BulkSelectionProvider, type BulkItem } from "./bulk-selection";
import { BulkToolbar } from "./bulk-toolbar";
import { ManualExpensePanel } from "./manual-expense-panel";
import { ReceiptUploader } from "./receipt-uploader";

import "./expenses.css";

function ShellHeader({
  month,
  onManualOpen,
  onUpload,
  reload
}: {
  month: string;
  onManualOpen: () => void;
  onUpload: (formData: FormData) => Promise<void>;
  reload: () => Promise<void>;
}) {
  return (
    <header className="exp-shell__header">
      <div className="exp-shell__brand">
        <div className="exp-shell__logo"><ReceiptText aria-hidden /></div>
        <div>
          <div className="exp-shell__name">票据</div>
          <div className="exp-shell__crumb">支出 / 票据 / 待处理</div>
        </div>
      </div>
      <div className="exp-shell__actions">
        <BudgetSettings month={month} onSaved={() => void reload()} />
      </div>
      <div className="exp-workbar">
        <ReceiptUploader
          compact
          hint="最多 2 张，失败会进入重试队列"
          maxBytesPerFile={8 * 1024 * 1024}
          maxFiles={2}
          onUpload={onUpload}
        />
        <button className="exp-workbar__button" onClick={onManualOpen} type="button">
          <Plus aria-hidden />
          记一笔
        </button>
        <a className="exp-workbar__button" href={`/api/expenses/export?format=csv&month=${encodeURIComponent(month)}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai")}`}>
          导出 CSV
        </a>
      </div>
    </header>
  );
}

export function ReceiptsModule() {
  const [month] = useState(currentMonth());
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [loadError, setLoadError] = useState<ExpenseLoadError | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingDrafts, setPendingDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});
  const [transactionDrafts, setTransactionDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);

  const orderedItems = useMemo<BulkItem[]>(() => {
    const receipts = (analytics?.pending_receipts ?? [])
      .filter((r) => r.status === "pending_review")
      .map((r) => ({ id: r.id, kind: "receipt" as const }));
    const transactions = (analytics?.recent_transactions ?? []).map((t) => ({
      id: t.id,
      kind: "transaction" as const
    }));
    return [...receipts, ...transactions];
  }, [analytics]);

  const load = useCallback(async () => {
    setLoadError(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC${formatUtcOffsetForClient()}`;
    const query = new URLSearchParams({
      month,
      tz,
      budget: String(getStoredBudgetCents()),
      primaryCurrency: getStoredPrimaryCurrency()
    });
    let response: Response;
    try {
      response = await fetch(`/api/expenses?${query.toString()}`);
    } catch (err) {
      setLoadError({ kind: "network", message: err instanceof Error ? err.message : "网络请求失败" });
      return;
    }
    if (!response.ok) {
      setLoadError({ kind: response.status >= 500 ? "server" : "client", message: `服务器返回 ${response.status}` });
      return;
    }
    try {
      const data = (await response.json()) as ExpenseAnalytics;
      setAnalytics(data);
      setPendingDrafts(Object.fromEntries(data.pending_receipts.map((r) => [r.id, r.extracted])));
      setTransactionDrafts(Object.fromEntries(data.recent_transactions.map((t) => [t.id, transactionToExtracted(t)])));
    } catch (err) {
      setLoadError({ kind: "client", message: err instanceof Error ? err.message : "解析响应失败" });
    }
  }, [month]);

  useEffect(() => {
    load().catch((err) => setLoadError({ kind: "network", message: err instanceof Error ? err.message : "消费数据加载失败" }));
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const uploadReceipt = useCallback(async (formData: FormData) => {
    setError("");
    setMessage("");
    const response = await fetch("/api/expenses/receipts", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    if (response.status === 409) {
      const existingId = (data as { existingReceiptId?: number }).existingReceiptId;
      setError(`已上传过这张图片${typeof existingId === "number" ? ` (receipt #${existingId})` : ""}，请到下方待确认区查看`);
      return;
    }
    if (!response.ok) {
      const failures = Array.isArray(data.failures)
        ? `; ${(data.failures as UploadFailure[]).map((f) => `${f.filename ?? "图片"}: ${f.error}`).join("; ")}`
        : "";
      setError(data.error ? `票据识别失败: ${data.error}${failures}` : "票据识别失败");
      return;
    }
    const receipts = (data.receipts ?? (data.receipt ? [data.receipt] : [])) as ExpenseReceiptSummary[];
    const failures = (data.failures ?? []) as UploadFailure[];
    const timings = (data.timings ?? []) as Array<{ filename?: string; provider?: string; model?: string; total_ms?: number; ocr_ms?: number }>;
    const jobsCount = Array.isArray(data.jobs) ? (data.jobs as unknown[]).length : 0;
    const summary = receipts.map((r) => `#${r.id} 已处理`).join(", ");
    const failureText = failures.length ? `; 失败 ${failures.length} 张: ${failures.map((f) => f.filename ?? "图片").join(", ")}` : "";
    const queuedText = jobsCount > 0 && receipts.length === 0 ? "; 图片已保存到识别队列，稍后自动重试" : "";
    setMessage(`${summary || "识别完成"}${failureText}${queuedText}${uploadTimingSummary(timings, data.total_ms)}`);
    await load();
  }, [load]);

  async function createManualExpense(input: ManualExpenseInput) {
    setError("");
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
      setMessage(`已记入: ${input.item_name} ${input.amount === null ? "-" : formatMoney(input.amount, input.currency ?? "CNY")}`);
      await load();
    } finally {
      setManualBusy(false);
    }
  }

  async function retryDueJobs() {
    const response = await fetch("/api/expenses/receipt-jobs/retry", { method: "POST" });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    setMessage(`已重试 ${data.processed ?? 0} 张票据`);
    await load();
  }

  async function retryJob(job: ExpenseReceiptJob) {
    setError("");
    setMessage("");
    const response = await fetch(`/api/expenses/receipt-jobs/${job.id}`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "重试失败");
      return;
    }
    setMessage("receipt" in data ? `队列 #${job.id} 已识别完成` : `队列 #${job.id} 仍未识别成功，稍后会继续重试`);
    await load();
  }

  async function deleteJob(job: ExpenseReceiptJob) {
    if (!window.confirm(`确认删除失败图片 ${job.original_filename}？本地图片也会一起删除。`)) return;
    setError("");
    setMessage("");
    const response = await fetch(`/api/expenses/receipt-jobs/${job.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "删除失败");
      return;
    }
    setMessage(`队列 #${job.id} 已删除`);
    await load();
  }

  async function confirmPending(receipt: ExpenseReceiptSummary) {
    const extracted = pendingDrafts[receipt.id] ?? receipt.extracted;
    setError("");
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
    await load();
  }

  async function deletePending(receipt: ExpenseReceiptSummary) {
    if (!window.confirm(`确认删除票据 #${receipt.id}？本地图片也会一起删除。`)) return;
    setError("");
    setMessage("");
    const response = await fetch(`/api/expenses/receipts/${receipt.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "删除失败");
      return;
    }
    setMessage(`票据 #${receipt.id} 已删除`);
    await load();
  }

  async function updatePosted(transaction: ExpenseTransaction) {
    const extracted = transactionDrafts[transaction.id] ?? transactionToExtracted(transaction);
    setError("");
    setMessage("");
    const response = await fetch(`/api/expenses/transactions/${transaction.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extracted })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "更新失败");
      return;
    }
    setMessage(`已入账 #${transaction.id} 已更新`);
    await load();
  }

  async function deletePosted(transaction: ExpenseTransaction) {
    if (!window.confirm(`确认删除已入账 #${transaction.id}？本地图片也会一起删除。`)) return;
    setError("");
    setMessage("");
    const response = await fetch(`/api/expenses/transactions/${transaction.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "删除失败");
      return;
    }
    setMessage(`已入账 #${transaction.id} 已删除`);
    await load();
  }

  return (
    <div className="exp-analytics">
      <ShellHeader month={month} onManualOpen={() => setManualOpen(true)} onUpload={uploadReceipt} reload={load} />
      <ManualExpensePanel busy={manualBusy} onClose={() => setManualOpen(false)} onSave={createManualExpense} open={manualOpen} />
      {error ? <div className="exp-banner exp-banner--error">{error}</div> : null}
      {loadError ? (
        <div className="exp-banner exp-banner--error" role="alert">
          <span>
            {loadError.kind === "network"
              ? `网络问题: ${loadError.message}`
              : loadError.kind === "server"
                ? `服务器错误: ${loadError.message}`
                : `客户端错误: ${loadError.message}`}
          </span>
          <button className="exp-btn exp-btn--secondary exp-btn--sm" onClick={() => void load()} type="button">重试</button>
        </div>
      ) : null}
      {message ? <div className="exp-banner exp-banner--ok">{message}</div> : null}

      <BulkSelectionProvider clearKey={month} items={orderedItems}>
        {analytics ? (
          <BulkToolbar mode="main" onError={setError} onMessage={setMessage} receiptDrafts={pendingDrafts} reload={() => load()} />
        ) : null}
        {analytics ? (
          <>
            <ReceiptsTask
              analytics={analytics}
              confirmPending={confirmPending}
              deleteJob={deleteJob}
              deletePending={deletePending}
              pendingDrafts={pendingDrafts}
              retryDueJobs={retryDueJobs}
              retryJob={retryJob}
              setPendingDrafts={setPendingDrafts}
            />
            <LedgerTask
              analytics={analytics}
              deletePosted={deletePosted}
              setTransactionDrafts={setTransactionDrafts}
              transactionDrafts={transactionDrafts}
              updatePosted={updatePosted}
            />
          </>
        ) : (
          <ExpenseLoadingPanel />
        )}
      </BulkSelectionProvider>
    </div>
  );
}
