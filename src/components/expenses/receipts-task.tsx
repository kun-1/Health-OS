"use client";

import { useState } from "react";
import { Check, ReceiptText } from "lucide-react";

import type {
  ExpenseAnalytics,
  ExpenseReceiptJob,
  ExpenseReceiptSummary,
  ExtractedExpenseReceipt
} from "@/lib/expenses/types";

import { PendingReceiptCard } from "./pending-card";

function jobStatusLabel(status: ExpenseReceiptJob["status"]) {
  if (status === "queued") return "等待识别";
  if (status === "processing") return "识别中";
  if (status === "failed") return "识别失败";
  if (status === "dead") return "已达重试上限";
  return "已完成";
}

function jobDisplayName(job: ExpenseReceiptJob) {
  const created = new Date(job.created_at);
  const time = Number.isNaN(created.getTime())
    ? null
    : created.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
  const filename = job.original_filename || "票据图片";
  return time ? `#${job.id} · ${time} · ${filename}` : `#${job.id} · ${filename}`;
}

function shortJobError(message: string) {
  if (message.includes("timeout") || message.includes("aborted")) {
    return "识别超时: MiniMax 已连接但返回太慢，可先点立即重试。";
  }
  if (message.includes("authentication failed") || message.includes("401") || message.includes("403")) {
    return "鉴权失败: 请检查 MiniMax API Key / Base URL。";
  }
  return message;
}

export function ReceiptsTask({
  analytics,
  deleteJob,
  deletePending,
  pendingDrafts,
  retryDueJobs,
  retryJob,
  setPendingDrafts,
  confirmPending
}: {
  analytics: ExpenseAnalytics;
  deleteJob: (job: ExpenseReceiptJob) => Promise<void>;
  deletePending: (receipt: ExpenseReceiptSummary) => Promise<void>;
  pendingDrafts: Record<number, ExtractedExpenseReceipt>;
  retryDueJobs: () => Promise<void>;
  retryJob: (job: ExpenseReceiptJob) => Promise<void>;
  setPendingDrafts: React.Dispatch<React.SetStateAction<Record<number, ExtractedExpenseReceipt>>>;
  confirmPending: (receipt: ExpenseReceiptSummary) => Promise<void>;
}) {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(analytics.receipt_jobs[0]?.id ?? null);
  const selectedJob = analytics.receipt_jobs.find((job) => job.id === selectedJobId) ?? analytics.receipt_jobs[0] ?? null;
  return (
    <div className="exp-screen exp-screen--receipts">
      <section className="exp-panel exp-panel--list">
        <div className="exp-section-head">
          <div>
            <p className="exp-eyebrow">票据处理</p>
            <h1>待确认票据 <span>({analytics.pending_receipts.length})</span></h1>
          </div>
        </div>
        <div className="exp-real-card-list">
          {analytics.pending_receipts.length === 0 ? (
            <div className="exp-empty exp-card">没有待确认票据</div>
          ) : (
            analytics.pending_receipts.map((receipt) => (
              <PendingReceiptCard
                draft={pendingDrafts[receipt.id] ?? receipt.extracted}
                key={receipt.id}
                onCancel={() => setPendingDrafts((current) => ({ ...current, [receipt.id]: receipt.extracted }))}
                onDelete={() => void deletePending(receipt)}
                onDraftChange={(next) => setPendingDrafts((current) => ({ ...current, [receipt.id]: next }))}
                onSave={() => void confirmPending(receipt)}
                receipt={receipt}
              />
            ))
          )}
        </div>
      </section>

      <section className="exp-panel exp-panel--detail">
        <div className="exp-detail-head">
          <div>
            <p className="exp-eyebrow">识别队列</p>
            <h2>{selectedJob ? jobDisplayName(selectedJob) : "暂无失败或排队任务"}</h2>
            <span>{selectedJob?.error_message ? shortJobError(selectedJob.error_message) : "OCR 队列会在后台自动处理，也可以手动重试。"}</span>
          </div>
          {selectedJob ? <span className="exp-status" data-status={selectedJob.status}>{jobStatusLabel(selectedJob.status)}</span> : null}
        </div>
        {analytics.receipt_jobs.length > 0 ? (
          <div className="exp-receipt-list exp-receipt-list--jobs">
            {analytics.receipt_jobs.map((job, index) => (
              <button
                className="exp-receipt-row"
                data-active={job.id === selectedJob?.id ? "true" : undefined}
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                type="button"
              >
                <span className="exp-receipt-row__check">{job.id === selectedJob?.id ? <Check aria-hidden /> : null}</span>
                <span className="exp-receipt-row__time">#{job.id}</span>
                <span className="exp-receipt-row__main">
                  <strong>{job.original_filename || `票据 ${index + 1}`}</strong>
                  <small>{job.error_message ? shortJobError(job.error_message) : `已尝试 ${job.attempts} 次`}</small>
                </span>
                <span className="exp-status" data-status={job.status}>{jobStatusLabel(job.status)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="exp-receipt-visual">
            <ReceiptText aria-hidden />
            <strong>队列为空</strong>
            <span>上传票据后，失败或排队中的 OCR 任务会出现在这里。</span>
          </div>
        )}
        <div className="exp-detail-actions">
          <button onClick={() => void retryDueJobs()} type="button">重试到期任务</button>
          {selectedJob ? <button onClick={() => void deleteJob(selectedJob)} type="button">删除任务</button> : null}
          {selectedJob ? <button data-primary="true" disabled={selectedJob.status === "dead"} onClick={() => void retryJob(selectedJob)} type="button">立即重试</button> : null}
        </div>
      </section>
    </div>
  );
}
