"use client";

/**
 * `/expenses/receipts` module — the records processing workbench.
 *
 * Owns everything related to turning a receipt image (or a manual entry)
 * into a posted transaction:
 *
 *   - ReceiptUploader    (drop / pick images, OCR queue)
 *   - ReceiptsTask       (pending receipt review + retry / delete jobs)
 *   - LedgerTask         (posted transactions grouped by date, editable)
 *   - ManualExpensePanel (quick manual entry)
 *   - BulkToolbar        (bulk confirm / exclude / delete)
 *
 * Header / data loader / banners are extracted into shared modules so
 * they stay in sync with /expenses (see expenses-header / use-expense-data
 * / expense-banners).
 */

import { useCallback, useMemo, useState } from "react";

import { formatMoney } from "@/lib/expenses/money";
import type {
  ExpenseReceiptJob,
  ExpenseReceiptSummary,
  ExpenseTransaction
} from "@/lib/expenses/types";

import {
  currentMonth,
  LedgerTask,
  LoadingPanel as ExpenseLoadingPanel,
  ReceiptsTask,
  transactionToExtracted,
  uploadTimingSummary,
  type ManualExpenseInput,
  type UploadFailure
} from "./expenses-client";
import { BulkSelectionProvider, type BulkItem } from "./bulk-selection";
import { BulkToolbar } from "./bulk-toolbar";
import { ConfirmDialog } from "./confirm-dialog";
import { ExpenseBanners } from "./shared/expense-banners";
import { ExpensesHeader } from "./shared/expenses-header";
import { useExpenseData } from "./shared/use-expense-data";

import "./expenses.css";

export function ReceiptsModule() {
  const [month] = useState(currentMonth());
  const {
    analytics,
    loadError,
    pendingDrafts,
    setPendingDrafts,
    transactionDrafts,
    setTransactionDrafts,
    reload
  } = useExpenseData(month);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  // Replace window.confirm with the styled ConfirmDialog.
  const [pendingDelete, setPendingDelete] = useState<{
    title: string;
    message: string;
    run: () => Promise<void>;
  } | null>(null);

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

  const uploadReceipt = useCallback(
    async (formData: FormData) => {
      setError("");
      setMessage("");
      const response = await fetch("/api/expenses/receipts", {
        method: "POST",
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        const existingId = (data as { existingReceiptId?: number }).existingReceiptId;
        setError(
          `已上传过这张图片${typeof existingId === "number" ? ` (receipt #${existingId})` : ""}，请到下方待确认区查看`
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
      await reload();
    },
    [reload]
  );

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
      setMessage(
        `已记入: ${input.item_name} ${input.amount === null ? "-" : formatMoney(input.amount, input.currency ?? "CNY")}`
      );
      await reload();
    } finally {
      setManualBusy(false);
    }
  }

  async function retryDueJobs() {
    const response = await fetch("/api/expenses/receipt-jobs/retry", { method: "POST" });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    setMessage(`已重试 ${data.processed ?? 0} 张票据`);
    await reload();
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
    await reload();
  }

  async function deleteJob(job: ExpenseReceiptJob) {
    setPendingDelete({
      title: "删除失败图片",
      message: `确认删除失败图片 ${job.original_filename}？本地图片也会一起删除。`,
      run: async () => {
        setError("");
        setMessage("");
        const response = await fetch(`/api/expenses/receipt-jobs/${job.id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "删除失败");
          return;
        }
        setMessage(`队列 #${job.id} 已删除`);
        await reload();
      }
    });
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
    await reload();
  }

  async function deletePending(receipt: ExpenseReceiptSummary) {
    setPendingDelete({
      title: "删除票据",
      message: `确认删除票据 #${receipt.id}？本地图片也会一起删除。`,
      run: async () => {
        setError("");
        setMessage("");
        const response = await fetch(`/api/expenses/receipts/${receipt.id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "删除失败");
          return;
        }
        setMessage(`票据 #${receipt.id} 已删除`);
        await reload();
      }
    });
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
    await reload();
  }

  async function deletePosted(transaction: ExpenseTransaction) {
    setPendingDelete({
      title: "删除已入账",
      message: `确认删除已入账 #${transaction.id}？本地图片也会一起删除。`,
      run: async () => {
        setError("");
        setMessage("");
        const response = await fetch(`/api/expenses/transactions/${transaction.id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "删除失败");
          return;
        }
        setMessage(`已入账 #${transaction.id} 已删除`);
        await reload();
      }
    });
  }

  return (
    <div className="exp-analytics">
      <ExpensesHeader
        kind="receipts"
        month={month}
        uploader={{ onUpload: uploadReceipt }}
        manualExpense={{
          open: manualOpen,
          busy: manualBusy,
          onOpen: () => setManualOpen(true),
          onClose: () => setManualOpen(false),
          onSave: createManualExpense
        }}
        onReload={reload}
      />
      <ExpenseBanners
        error={error}
        loadError={loadError}
        message={message}
        onRetry={() => void reload()}
      />
      <BulkSelectionProvider clearKey={month} items={orderedItems}>
        {analytics ? (
          <BulkToolbar
            mode="main"
            onError={setError}
            onMessage={setMessage}
            receiptDrafts={pendingDrafts}
            reload={() => reload()}
          />
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
              setPendingDrafts={(updater) =>
                setPendingDrafts((prev) =>
                  typeof updater === "function" ? updater(prev) : updater
                )
              }
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
        title={pendingDelete?.title ?? "确认"}
      />
    </div>
  );
}