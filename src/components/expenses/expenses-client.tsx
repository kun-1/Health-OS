"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleDollarSign,
  LineChart,
  Plus,
  ReceiptText,
  Wallet
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { formatMoney, fromCents } from "@/lib/expenses/money";
import { getStoredBudgetCents, getStoredPrimaryCurrency } from "@/lib/expenses/settings";
import type {
  ExpenseAnalytics,
  ExpenseCategory,
  ExpenseReceiptJob,
  ExpenseReceiptSummary,
  ExpenseTransaction,
  ExtractedExpenseReceipt
} from "@/lib/expenses/types";

import { BudgetSettings } from "./budget-settings";
import { BulkSelectionProvider, type BulkItem } from "./bulk-selection";
import { BulkToolbar } from "./bulk-toolbar";
import { categoryColor, categoryEmoji, categoryLabel } from "./category-colors";
import { ManualExpensePanel } from "./manual-expense-panel";
import { PendingReceiptCard } from "./pending-card";
import { ReceiptUploader } from "./receipt-uploader";
import { TransactionCard } from "./transaction-card";
import "./expenses.css";

type ExpenseTask = "budget" | "structure" | "receipts";

type UploadTiming = {
  filename?: string;
  provider?: string;
  model?: string;
  total_ms?: number;
  ocr_ms?: number;
};

export type UploadFailure = { filename?: string; error: string; timing?: UploadTiming };

export type ManualExpenseInput = {
  merchant_name: string;
  purchased_at: string;
  item_name: string;
  category_zh: ExpenseCategory;
  amount: number | null;
  notes: string | null;
  currency: string;
  excludedFromBudget?: boolean;
};

export type LoadError = { kind: "network" | "server" | "client"; message: string };

function runTaskTransition(update: () => void) {
  if (typeof document === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const transitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };
  if (typeof transitionDocument.startViewTransition !== "function") {
    update();
    return;
  }
  transitionDocument.startViewTransition(update);
}

const TASKS: Array<{ id: ExpenseTask; label: string; icon: typeof Wallet }> = [
  { id: "budget", label: "预算趋势", icon: LineChart },
  { id: "structure", label: "分类结构", icon: CircleDollarSign },
  { id: "receipts", label: "票据处理", icon: ReceiptText }
];

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function daysRemainingInMonth(month: string) {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 0;
  const today = new Date();
  const isCurrent = today.getFullYear() === y && today.getMonth() + 1 === m;
  const lastDay = new Date(y, m, 0).getDate();
  if (isCurrent) return Math.max(0, lastDay - today.getDate());
  return lastDay;
}

function formatDuration(ms: number | undefined) {
  if (!Number.isFinite(ms)) return null;
  if ((ms ?? 0) < 1000) return `${ms}ms`;
  return `${((ms ?? 0) / 1000).toFixed(1)}s`;
}

export function uploadTimingSummary(timings: UploadTiming[], totalMs?: number) {
  const total = formatDuration(totalMs);
  const perFile = timings
    .map((timing) => {
      const duration = formatDuration(timing.ocr_ms ?? timing.total_ms);
      if (!duration) return null;
      const model = timing.model ? ` ${timing.model}` : "";
      return `${timing.filename ?? "图片"}: ${duration}${model}`;
    })
    .filter(Boolean)
    .join("; ");
  if (total && perFile) return `; 总耗时 ${total} (${perFile})`;
  if (total) return `; 总耗时 ${total}`;
  if (perFile) return `; ${perFile}`;
  return "";
}

function formatMoneyCompact(value: number, currency: string) {
  return new Intl.NumberFormat("zh-CN", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

export function formatUtcOffsetForClient() {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function transactionToExtracted(transaction: ExpenseTransaction): ExtractedExpenseReceipt {
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
      category_raw: item.category_raw,
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

function Shell({
  activeTask,
  month,
  onManualOpen,
  onTaskChange,
  onUpload,
  reload
}: {
  activeTask: ExpenseTask;
  month: string;
  onManualOpen: () => void;
  onTaskChange: (task: ExpenseTask) => void;
  onUpload: (formData: FormData) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const active = TASKS.find((task) => task.id === activeTask) ?? TASKS[0];
  return (
    <header className="exp-shell__header">
      <div className="exp-shell__brand">
        <div className="exp-shell__logo"><Wallet aria-hidden /></div>
        <div>
          <div className="exp-shell__name">支出</div>
          <div className="exp-shell__crumb">支出 / {active.label}</div>
        </div>
      </div>
      <div className="exp-shell__actions">
        <BudgetSettings month={month} onSaved={() => void reload()} />
      </div>
      <nav className="exp-tasknav" aria-label="支出任务">
        {TASKS.map((task) => {
          const Icon = task.icon;
          return (
            <button
              className="exp-tasknav__item"
              data-active={task.id === activeTask ? "true" : undefined}
              key={task.id}
              onClick={() => onTaskChange(task.id)}
              type="button"
            >
              <Icon aria-hidden />
              {task.label}
            </button>
          );
        })}
      </nav>
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

export function LoadingPanel() {
  return (
    <div className="exp-panel exp-panel--wide">
      <div className="exp-loading-row">
        <span className="exp-state-pulse" />
        支出数据加载中...
      </div>
    </div>
  );
}

export function BudgetTask({ analytics, days }: { analytics: ExpenseAnalytics; days: number }) {
  const line = analytics.daily_totals.map((item) => ({
    ...item,
    label: item.day.slice(5),
    budget: fromCents(analytics.budget_progress.budget)
  }));
  return (
    <div className="exp-screen exp-screen--budget">
      <section className="exp-panel exp-panel--chart">
        <div className="exp-section-head">
          <div>
            <p className="exp-eyebrow">预算趋势</p>
            <h1>本月累计消费曲线</h1>
            <div className="exp-chart-metric">
              <strong>{formatMoneyCompact(fromCents(analytics.budget_progress.spent), analytics.primary_currency)}</strong>
              <span>
                {analytics.budget_progress.over_budget
                  ? `已超出 ${formatMoneyCompact(Math.abs(fromCents(analytics.budget_progress.remaining)), analytics.budget_currency)}`
                  : `剩余 ${formatMoneyCompact(fromCents(analytics.budget_progress.remaining), analytics.budget_currency)}`}
              </span>
            </div>
          </div>
          <div className="exp-segment" aria-label="当前展示范围">
            <span>7天</span>
            <span data-active="true">30天</span>
            <span>90天</span>
          </div>
        </div>
        <ResponsiveContainer height={430} width="100%">
          <AreaChart data={line} margin={{ bottom: 10, left: 0, right: 20, top: 20 }}>
            <defs>
              <linearGradient id="expense-spend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#11d7c6" stopOpacity={0.34} />
                <stop offset="95%" stopColor="#11d7c6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 6" vertical={false} />
            <XAxis axisLine={false} dataKey="label" tick={{ fill: "#6f7c83", fontSize: 12 }} tickLine={false} />
            <YAxis axisLine={false} tick={{ fill: "#6f7c83", fontSize: 12 }} tickFormatter={(value) => `¥${Number(value).toFixed(0)}`} tickLine={false} />
            <Tooltip contentStyle={{ background: "#10181b", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} formatter={(value) => formatMoney(Number(value), analytics.primary_currency)} />
            <Area dataKey="amount" fill="url(#expense-spend-fill)" name="累计消费" stroke="#11d7c6" strokeWidth={2.5} type="monotone" />
            <Area dataKey="budget" fill="transparent" name="预算线" stroke="#f5b833" strokeDasharray="5 5" strokeWidth={1.5} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="exp-panel exp-panel--side">
        <div className="exp-section-head exp-section-head--compact">
          <div>
            <p className="exp-eyebrow">预算状态</p>
            <h2>剩余天数和额度</h2>
          </div>
        </div>
        <div className="exp-budget-meter">
          <strong>{Math.round((analytics.budget_progress.spent / Math.max(1, analytics.budget_progress.budget)) * 100)}%</strong>
          <span>预算使用率</span>
          <i><b style={{ width: `${Math.min(100, Math.round((analytics.budget_progress.spent / Math.max(1, analytics.budget_progress.budget)) * 100))}%` }} /></i>
        </div>
        <div className="exp-side-stats">
          <div><span>月度预算</span><strong>{formatMoneyCompact(fromCents(analytics.budget_progress.budget), analytics.budget_currency)}</strong></div>
          <div><span>剩余预算</span><strong>{formatMoneyCompact(fromCents(analytics.budget_progress.remaining), analytics.budget_currency)}</strong></div>
          <div><span>每日可用</span><strong>{formatMoneyCompact(fromCents(analytics.budget_progress.remaining) / Math.max(1, days), analytics.budget_currency)}</strong></div>
        </div>
      </section>

      <TransactionBand transactions={analytics.recent_transactions.slice(0, 5)} title="最近影响预算的交易" />
    </div>
  );
}

export function StructureTask({ analytics }: { analytics: ExpenseAnalytics }) {
  const categoryData = analytics.category_breakdown
    .map((item) => ({
      amount: item.amount,
      category: item.category_zh,
      color: categoryColor(item.category_zh),
      percent: Math.round((item.amount / Math.max(1, analytics.budget_progress.spent)) * 100)
    }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="exp-screen exp-screen--structure">
      <section className="exp-panel exp-panel--allocation">
        <div className="exp-section-head">
          <div>
            <p className="exp-eyebrow">分类结构</p>
            <h1>钱主要流向哪里</h1>
          </div>
          <div className="exp-summary-number">
            <span>{categoryData[0]?.percent ?? 0}%</span>
            <small>最大类别占比</small>
          </div>
        </div>
        <ResponsiveContainer height={420} width="100%">
          <PieChart>
            <Pie cx="50%" cy="50%" data={categoryData} dataKey="percent" innerRadius={112} outerRadius={184} paddingAngle={1.5} stroke="#081012" strokeWidth={2}>
              {categoryData.map((entry) => (
                <Cell fill={entry.color} key={entry.category} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name, item) => [`${value}% · ${formatMoney(fromCents(item.payload.amount), analytics.primary_currency)}`, name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="exp-legend">
          {categoryData.slice(0, 6).map((item) => (
            <span key={item.category}><i style={{ background: item.color }} />{categoryLabel(item.category)} {item.percent}%</span>
          ))}
        </div>
      </section>

      <section className="exp-panel exp-panel--side">
        <div className="exp-section-head exp-section-head--compact">
          <div>
            <p className="exp-eyebrow">类别偏移</p>
            <h2>相比预算目标的压力</h2>
          </div>
        </div>
        <div className="exp-bars">
          {categoryData.slice(0, 6).map((item) => (
            <div className="exp-bar-row" key={item.category}>
              <div className="exp-bar-row__meta">
                <span><i style={{ background: item.color }} />{categoryEmoji(item.category)} {categoryLabel(item.category)}</span>
                <strong>{formatMoneyCompact(fromCents(item.amount), analytics.primary_currency)}</strong>
              </div>
              <div className="exp-range"><span style={{ width: `${Math.min(100, item.percent * 1.8)}%`, background: item.color }} /></div>
              <div className="exp-bar-row__foot">
                <small>{item.percent}% of monthly spend</small>
                <small>{item.percent > 35 ? "偏高" : "正常"}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="exp-panel exp-panel--wide">
        <div className="exp-section-head exp-section-head--compact">
          <div>
            <p className="exp-eyebrow">类别对比</p>
            <h2>按金额排序</h2>
          </div>
        </div>
        <ResponsiveContainer height={240} width="100%">
          <BarChart data={categoryData} margin={{ bottom: 0, left: 0, right: 12, top: 12 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 6" vertical={false} />
            <XAxis axisLine={false} dataKey="category" tick={{ fill: "#6f7c83", fontSize: 12 }} tickLine={false} tickFormatter={(value) => categoryLabel(String(value))} />
            <YAxis axisLine={false} tick={{ fill: "#6f7c83", fontSize: 12 }} tickFormatter={(value) => `¥${fromCents(Number(value)).toFixed(0)}`} tickLine={false} />
            <Tooltip contentStyle={{ background: "#10181b", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} formatter={(value) => formatMoney(fromCents(Number(value)), analytics.primary_currency)} />
            <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
              {categoryData.map((entry) => (
                <Cell fill={entry.color} key={entry.category} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
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

function TransactionBand({ title, transactions }: { title: string; transactions: ExpenseAnalytics["recent_transactions"] }) {
  return (
    <section className="exp-panel exp-panel--wide">
      <div className="exp-section-head exp-section-head--compact">
        <div>
          <p className="exp-eyebrow">流水</p>
          <h2>{title}</h2>
        </div>
        <a className="exp-filter" href="/expenses/all">查看全部</a>
      </div>
      <div className="exp-transaction-list">
        {transactions.length === 0 ? (
          <div className="exp-empty exp-card">还没有入账消费</div>
        ) : (
          transactions.map((transaction) => (
            <div className="exp-transaction-row" key={transaction.id}>
              <span>{categoryEmoji(transaction.items[0]?.category_zh ?? "其他")}</span>
              <div>
                <strong>{transaction.merchant_name}</strong>
                <span>{new Date(transaction.purchased_at).toLocaleDateString("zh-CN")} · {categoryLabel(transaction.items[0]?.category_zh ?? "其他")}</span>
              </div>
              {transaction.duplicate_hint ? <span className="exp-status" data-status="queued">疑似重复</span> : null}
              <strong>{formatMoney(transaction.total_amount, transaction.currency)}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

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

export function ExpensesClient() {
  const [activeTask, setActiveTask] = useState<ExpenseTask>("budget");
  const [month] = useState(currentMonth());
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
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

  const handleTaskChange = useCallback((task: ExpenseTask) => {
    if (task === activeTask) return;
    runTaskTransition(() => setActiveTask(task));
  }, [activeTask]);

  async function uploadReceipt(formData: FormData) {
    setError("");
    setMessage("");
    const response = await fetch("/api/expenses/receipts", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    if (response.status === 409) {
      const existingId = (data as { existingReceiptId?: number }).existingReceiptId;
      setError(`已上传过这张图片${typeof existingId === "number" ? ` (receipt #${existingId})` : ""}，请到待确认区查看`);
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
    const timings = (data.timings ?? []) as UploadTiming[];
    const jobsCount = Array.isArray(data.jobs) ? (data.jobs as unknown[]).length : 0;
    const summary = receipts.map((r) => `#${r.id} 已处理`).join(", ");
    const failureText = failures.length ? `; 失败 ${failures.length} 张: ${failures.map((f) => f.filename ?? "图片").join(", ")}` : "";
    const queuedText = jobsCount > 0 && receipts.length === 0 ? "; 图片已保存到识别队列，稍后自动重试" : "";
    setMessage(`${summary || "识别完成"}${failureText}${queuedText}${uploadTimingSummary(timings, data.total_ms)}`);
    runTaskTransition(() => setActiveTask("receipts"));
    await load();
  }

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

  const days = analytics ? daysRemainingInMonth(analytics.month) : 0;

  return (
    <div className="exp-analytics">
      <Shell
        activeTask={activeTask}
        month={month}
        onManualOpen={() => setManualOpen(true)}
        onTaskChange={handleTaskChange}
        onUpload={uploadReceipt}
        reload={load}
      />
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
            {activeTask === "budget" ? <BudgetTask analytics={analytics} days={days} /> : null}
            {activeTask === "structure" ? <StructureTask analytics={analytics} /> : null}
            {activeTask === "receipts" ? (
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
            ) : null}
            {activeTask !== "receipts" ? (
              <LedgerTask
                analytics={analytics}
                deletePosted={deletePosted}
                setTransactionDrafts={setTransactionDrafts}
                transactionDrafts={transactionDrafts}
                updatePosted={updatePosted}
              />
            ) : null}
          </>
        ) : (
          <LoadingPanel />
        )}
      </BulkSelectionProvider>
    </div>
  );
}
