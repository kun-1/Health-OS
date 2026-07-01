"use client";

/**
 * `/expenses/receipts` module — receipt input + OCR processing.
 *
 * Responsibilities:
 *   - ReceiptUploader    (drop / pick images)
 *   - ReceiptsTask       (pending receipt review + retry / delete jobs)
 *   - BulkToolbar        (bulk confirm pending receipts)
 *
 * Posted transactions are managed on `/expenses/transactions`; manual entry
 * and CSV export also live there. This keeps the receipts page focused on
 * turning receipt images into confirmed transactions.
 */

import { useCallback, useMemo, useState } from "react";

import type {
  ExpenseReceiptJob,
  ExpenseReceiptSummary
} from "@/lib/expenses/types";

import { BulkSelectionProvider, type BulkItem } from "./bulk-selection";
import { BulkToolbar } from "./bulk-toolbar";
import { ConfirmDialog } from "./confirm-dialog";
import { ReceiptsTask } from "./receipts-task";
import { ExpenseBanners } from "./shared/expense-banners";
import { ExpensesHeader } from "./shared/expenses-header";
import {
  LoadingPanel as ExpenseLoadingPanel,
  uploadTimingSummary,
  type UploadFailure
} from "./shared/task-helpers";
import { useExpenseData } from "./shared/use-expense-data";
import { useSelectedMonth } from "@/components/shared/use-selected-month";

import "./expenses.css";

export function ReceiptsModule() {
  const month = useSelectedMonth();
  const {
    analytics,
    loadError,
    pendingDrafts,
    setPendingDrafts,
    reload
  } = useExpenseData(month);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    title: string;
    message: string;
    run: () => Promise<void>;
  } | null>(null);

  const orderedItems = useMemo<BulkItem[]>(() => {
    return (analytics?.pending_receipts ?? [])
      .filter((r) => r.status === "pending_review")
      .map((r) => ({ id: r.id, kind: "receipt" as const }));
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
              .join("; " )}`
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

  return (
    <div className="exp-analytics">
      <ExpensesHeader
        kind="receipts"
        month={month}
        showBudgetSettings={false}
        uploader={{ onUpload: uploadReceipt }}
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
