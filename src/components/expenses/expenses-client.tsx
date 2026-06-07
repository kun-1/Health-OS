"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney, fromCents } from "@/lib/expenses/money";
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
import { CategoryDonut } from "./category-donut";
import { HeroRing } from "./hero-ring";
import { ManualExpensePanel } from "./manual-expense-panel";
import { PendingReceiptCard } from "./pending-card";
import { ReceiptUploader } from "./receipt-uploader";
import { receiptImageUrl } from "./receipt-image-url";
import { ThemeToggle, getInitialTheme, type Theme } from "./theme-toggle";
import { TransactionCard } from "./transaction-card";
import { getStoredBudgetCents, getStoredPrimaryCurrency } from "@/lib/expenses/settings";
import "./expenses.css";

type UploadTiming = {
  filename?: string;
  provider?: string;
  model?: string;
  total_ms?: number;
  ocr_ms?: number;
};

type UploadFailure = { filename?: string; error: string; timing?: UploadTiming };

type ManualExpenseInput = {
  merchant_name: string;
  purchased_at: string;
  item_name: string;
  category_zh: ExpenseCategory;
  amount: number | null;
  notes: string | null;
  currency: string;
  excludedFromBudget?: boolean;
};

// Wave 1 fix (Bug #27): typed load failures so the UI can branch on
// network vs server vs client problems.
type LoadError = { kind: "network" | "server" | "client"; message: string };

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function daysRemainingInMonth(month: string) {
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

function uploadTimingSummary(timings: UploadTiming[], totalMs?: number) {
  const total = formatDuration(totalMs);
  const perFile = timings
    .map((timing) => {
      const duration = formatDuration(timing.ocr_ms ?? timing.total_ms);
      if (!duration) return null;
      const model = timing.model ? ` ${timing.model}` : "";
      return `${timing.filename ?? "图片"}：${duration}${model}`;
    })
    .filter(Boolean)
    .join("；");
  if (total && perFile) return `；总耗时 ${total}（${perFile}）`;
  if (total) return `；总耗时 ${total}`;
  if (perFile) return `；${perFile}`;
  return "";
}

function formatMoneyCompact(value: number, currency: string) {
  return new Intl.NumberFormat("zh-CN", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

function formatUtcOffsetForClient() {
  // Wave 1 fix (Bug #9): build a UTC offset string like "+08:00" for the
  // client. Intl.DateTimeFormat().resolvedOptions().timeZone usually returns
  // an IANA name; this is the fallback when it doesn't.
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

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

function jobStatusLabel(status: ExpenseReceiptJob["status"]) {
  if (status === "queued") return "等待识别";
  if (status === "processing") return "识别中";
  if (status === "failed") return "识别失败";
  // Wave 1 cleanup: "dead" is a TEXT status (not in the TS enum) used to mark
  // jobs that have hit MAX_JOB_ATTEMPTS. Surface it explicitly so the queue
  // card doesn't pretend the job is still in progress.
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
    return "识别超时：MiniMax 已连接但返回太慢，可先点“立即重试”。";
  }
  if (message.includes("authentication failed") || message.includes("401") || message.includes("403")) {
    return "鉴权失败：请检查 MiniMax API Key / Base URL。";
  }
  return message;
}

// Wave 1 cleanup: pick out the non-primary currencies so the page can show
// "另有 $X USD" lines. Returns a stable-sorted array for deterministic render.
function otherCurrencyTotals(
  totalByCurrency: Record<string, number>,
  primary: string
): { currency: string; cents: number }[] {
  return Object.entries(totalByCurrency)
    .filter(([currency, cents]) => currency !== primary && cents > 0)
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => b.cents - a.cents);
}

export function ExpensesClient() {
  const [month, setMonth] = useState(currentMonth());
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  // Wave 1 fix (Bug #27): structured error state.
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [pendingDrafts, setPendingDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});
  const [transactionDrafts, setTransactionDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  // Wave 3 auth: tracks whether the server has EXPENSES_PASSWORD set, so we
  // can hide the logout button on dev installs that don't need it.
  const [authEnabled, setAuthEnabled] = useState(false);

  // Wave 3 bulk: ordered list of selectable items (pending receipts first,
  // then posted transactions). Pass-through to the provider so shift-click
  // can compute a range across the full visible list — not just what's
  // currently scrolled into the DOM.
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

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/status")
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then((data: { enabled?: boolean }) => {
        if (!cancelled) setAuthEnabled(Boolean(data.enabled));
      })
      .catch(() => {
        if (!cancelled) setAuthEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("expenses-theme", theme);
  }, [theme]);

  const load = useCallback(async () => {
    setLoadError(null);
    setError("");
    // Wave 1 fix (Bug #9): send the user's IANA timezone so month boundaries
    // align with the local calendar. We approximate with the UTC offset string
    // — the server uses it as a fallback when no explicit tz is sent.
    // Wave 2 feature: budget settings — also pass the localStorage budget and
    // primary currency as query params so the server can apply them.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC${formatUtcOffsetForClient()}`;
    const budget = getStoredBudgetCents();
    const primaryCurrency = getStoredPrimaryCurrency();
    const query = new URLSearchParams({
      month,
      tz,
      budget: String(budget),
      primaryCurrency
    });
    let response: Response;
    try {
      response = await fetch(`/api/expenses?${query.toString()}`);
    } catch (err) {
      setLoadError({
        kind: "network",
        message: err instanceof Error ? err.message : "网络请求失败"
      });
      return;
    }
    if (!response.ok) {
      setLoadError({
        kind: response.status >= 500 ? "server" : "client",
        message: `服务器返回 ${response.status}`
      });
      return;
    }
    let data: ExpenseAnalytics;
    try {
      data = (await response.json()) as ExpenseAnalytics;
    } catch (err) {
      setLoadError({
        kind: "client",
        message: err instanceof Error ? err.message : "解析响应失败"
      });
      return;
    }
    setAnalytics(data);
    setPendingDrafts(
      Object.fromEntries(data.pending_receipts.map((r) => [r.id, r.extracted]))
    );
    setTransactionDrafts(
      Object.fromEntries(
        data.recent_transactions.map((t) => [t.id, transactionToExtracted(t)])
      )
    );
  }, [month]);

  useEffect(() => {
    load().catch((err) =>
      setLoadError({
        kind: "network",
        message: err instanceof Error ? err.message : "消费数据加载失败"
      })
    );
  }, [load]);

  const retryDueJobs = useCallback(async () => {
    const response = await fetch("/api/expenses/receipt-jobs/retry", { method: "POST" });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    if (data.processed > 0) {
      setMessage(`已重试 ${data.processed} 张票据`);
      await load();
    }
  }, [load]);

  useEffect(() => {
    // Wave 3 worker: OCR runs server-side in the scheduler now, so the
    // client only needs to refresh to see results — no manual /retry kick.
    // The /retry endpoint still exists for the manual "重试全部" button below.
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Wave 3 polish (M1): a backgrounded tab never fires setInterval, so
  // returning to the page can show stale analytics for up to 90s. Refresh
  // immediately on visibility change so the user sees up-to-date data when
  // they come back. The setInterval above is unchanged.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        load().catch(() => undefined);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [load]);

  async function uploadReceipt(formData: FormData) {
    setError("");
    setMessage("");
    const response = await fetch("/api/expenses/receipts", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    if (response.status === 409) {
      // Wave 3 dedup: server rejected the upload because the SHA-256 hash
      // already exists. Surface the existing receipt id inline so the user
      // can find the original (or remove it from the queue and resubmit).
      // Inline error renders via the existing error banner; no auto-jump.
      const existingId = (data as { existingReceiptId?: number }).existingReceiptId;
      const idText = typeof existingId === "number" ? `（receipt #${existingId}）` : "";
      setError(`已上传过这张图片${idText}，请到待确认区查看`);
      return;
    }
    if (!response.ok) {
      const failures = Array.isArray(data.failures)
        ? `；${(data.failures as UploadFailure[]).map((f) => `${f.filename ?? "图片"}：${f.error}`).join("；")}`
        : "";
      const timingText = uploadTimingSummary((data.timings ?? []) as UploadTiming[], data.total_ms);
      setError(data.error ? `票据识别失败：${data.error}${failures}${timingText}` : `票据识别失败${timingText}`);
      return;
    }
    const receipts = (data.receipts ?? (data.receipt ? [data.receipt] : [])) as ExpenseReceiptSummary[];
    const failures = (data.failures ?? []) as UploadFailure[];
    const timings = (data.timings ?? []) as UploadTiming[];
    const jobsCount = Array.isArray(data.jobs) ? (data.jobs as unknown[]).length : 0;
    const summary = receipts.map((r) => `#${r.id} 已处理`).join("，");
    const failureText = failures.length
      ? `；失败 ${failures.length} 张：${failures.map((f) => f.filename ?? "图片").join("、")}`
      : "";
    const queuedText =
      jobsCount > 0 && receipts.length === 0
        ? "；图片已保存到识别队列，稍后自动重试"
        : "";
    setMessage(`${summary || "识别完成"}${failureText}${queuedText}${uploadTimingSummary(timings, data.total_ms)}`);
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
      // Wave 1 fix (Bug #12): use the transaction's own currency for the
      // confirmation toast instead of hardcoding ¥.
      setMessage(
        `已记入：${input.item_name} ${input.amount === null ? "—" : formatMoney(input.amount, input.currency ?? "CNY")}`
      );
      await load();
    } finally {
      setManualBusy(false);
    }
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

  // Wave 1 fix (Bug #14): per-transaction currency is the only correct source.
  // Page-level KPIs/hero/donut use the analytics primary_currency for
  // best-effort display; cards always use their own transaction.currency.
  // Wave 3 polish (M6): the old `const currency = "CNY"` was dead — every
  // consumer now reads analytics.primary_currency / budget_currency directly.
  const days = analytics ? daysRemainingInMonth(analytics.month) : 0;
  // Wave 1 cleanup: surface non-primary-currency totals on the page (small
  // muted line under the KPI / hero / donut) so users with mixed-currency
  // data know their non-CNY spending exists.
  const otherCurrencies = analytics
    ? otherCurrencyTotals(analytics.total_by_currency, analytics.primary_currency)
    : [];
  const otherCurrenciesText = otherCurrencies
    .map((entry) => `${formatMoneyCompact(fromCents(entry.cents), entry.currency)}`)
    .join(" / ");

  return (
    <div className="exp" data-expenses-theme={theme}>
      <header className="exp-header">
        <div className="exp-header__brand">
          <span className="exp-header__mark" aria-hidden>
            <svg fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
              <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </span>
          <div>
            <h1 className="exp-header__title">生活支出</h1>
            <p className="exp-header__subtitle">票据识别 · 自动入账 · 消费分析</p>
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
          <ThemeToggle onChange={setTheme} theme={theme} />
          {/* Wave 3 auth: only show the logout button when auth is actually
              enabled server-side. /api/auth/status tells us without leaking
              the password itself. */}
          {authEnabled ? (
            <button
              className="exp-btn exp-btn--secondary exp-btn--sm"
              onClick={() => void logout()}
              type="button"
            >
              登出
            </button>
          ) : null}
          {/* Wave 2 feature: budget settings */}
          <BudgetSettings onSaved={() => void load()} />
          {/* Wave 2 feature: export */}
          <a
            className="exp-btn exp-btn--secondary exp-btn--sm"
            href={`/api/expenses/export?format=csv&month=${encodeURIComponent(month)}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai")}`}
          >
            导出 CSV
          </a>
          <a
            className="exp-btn exp-btn--secondary exp-btn--sm"
            href={`/api/expenses/export?format=json&month=${encodeURIComponent(month)}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai")}`}
          >
            导出 JSON
          </a>
          {/* Wave 3 subscription: link to the recurring-rules manager from the
              main header. Sits next to the export buttons so the user notices
              it without us hiding it inside a dropdown. */}
          <a className="exp-btn exp-btn--secondary exp-btn--sm" href="/expenses/recurring">
            <span aria-hidden>📅</span>
            订阅
          </a>
          <button className="exp-btn exp-btn--primary exp-btn--sm" onClick={() => setManualOpen(true)} type="button">
            <span aria-hidden>✍️</span>
            记一笔
          </button>
          <ReceiptUploader
            compact
            hint="最多 2 张，失败会进入重试队列"
            maxBytesPerFile={8 * 1024 * 1024}
            maxFiles={2}
            onUpload={uploadReceipt}
          />
        </div>
      </header>

      {error ? <div className="exp-banner exp-banner--error">{error}</div> : null}
      {loadError ? (
        <div className="exp-banner exp-banner--error" role="alert">
          <span>
            {loadError.kind === "network"
              ? `网络问题：${loadError.message}，点击重试`
              : loadError.kind === "server"
                ? `服务器错误：${loadError.message}，稍后重试`
                : `客户端错误：${loadError.message}`}
          </span>
          <button
            className="exp-btn exp-btn--secondary exp-btn--sm"
            onClick={() => void load()}
            type="button"
          >
            重试
          </button>
        </div>
      ) : null}
      {message ? <div className="exp-banner exp-banner--ok">{message}</div> : null}
      <ManualExpensePanel
        busy={manualBusy}
        onClose={() => setManualOpen(false)}
        onSave={createManualExpense}
        open={manualOpen}
      />

      {/* Wave 3 bulk: provider powers checkbox + shift-range across the home
          page's selectable cards (pending receipts + posted transactions). */}
      <BulkSelectionProvider clearKey={month} items={orderedItems}>
        {analytics ? (
          <BulkToolbar
            mode="main"
            onError={setError}
            onMessage={setMessage}
            receiptDrafts={pendingDrafts}
            reload={() => load()}
          />
        ) : null}

      {analytics ? (
        <>
          <section className="exp-kpis" aria-label="本月概览">
            <div className="exp-kpi">
              <span className="exp-kpi__label">本月已花</span>
              <span
                className="exp-kpi__value"
                title={
                  otherCurrencies.length > 0
                    ? `未换算合计：${formatMoneyCompact(analytics.spent_this_month, analytics.primary_currency)}（多币种仅按数字相加）`
                    : undefined
                }
              >
                {formatMoneyCompact(fromCents(analytics.budget_progress.spent), analytics.primary_currency)}
              </span>
              <span className="exp-kpi__meta">
                预算 {formatMoneyCompact(fromCents(analytics.budget_progress.budget), analytics.budget_currency)}
              </span>
              {otherCurrencies.length > 0 ? (
                <span className="exp-card__meta" style={{ whiteSpace: "normal" }}>
                  另有 {otherCurrenciesText} 未计入
                </span>
              ) : null}
            </div>
            <div className="exp-kpi">
              <span className="exp-kpi__label">剩余预算</span>
              <span
                className={analytics.budget_progress.remaining < 0 ? "exp-kpi__value exp-kpi__value--danger" : "exp-kpi__value"}
              >
                {formatMoneyCompact(fromCents(analytics.budget_progress.remaining), analytics.budget_currency)}
              </span>
              <span className="exp-kpi__meta">{days} 天后结算</span>
            </div>
            <div className="exp-kpi">
              <span className="exp-kpi__label">剩余日均</span>
              <span className="exp-kpi__value">
                {formatMoneyCompact(
                  fromCents(analytics.budget_progress.remaining) / Math.max(1, days),
                  analytics.budget_currency
                )}
              </span>
              <span className="exp-kpi__meta">按剩余预算计算</span>
            </div>
            <div className="exp-kpi exp-kpi--action">
              <span className="exp-kpi__label">待确认票据</span>
              <span className="exp-kpi__value">{analytics.pending_receipts.length}</span>
              <span className="exp-kpi__meta">需要核对金额或识别置信度</span>
            </div>
          </section>

          {analytics.budget_progress_label ? (
            <div className="exp-card__meta" style={{ marginTop: -8, marginBottom: 12 }}>
              <span aria-hidden>🪧</span> {analytics.budget_progress_label}
            </div>
          ) : null}

          {analytics.receipt_jobs.length > 0 ? (
            <section className="exp-job-queue">
              <div className="exp-col__head">
                <h2 className="exp-section-title">
                  <span aria-hidden>⏳</span>
                  识别队列
                  <span className="exp-section-title__count">{analytics.receipt_jobs.length}</span>
                </h2>
                <button className="exp-btn exp-btn--secondary exp-btn--sm" onClick={() => void retryDueJobs()} type="button">
                  重试到期任务
                </button>
              </div>
              <div className="exp-job-list">
                {analytics.receipt_jobs.map((job) => (
                  <div className="exp-job" key={job.id}>
                    {receiptImageUrl(job.image_path) ? (
                      <img
                        alt={`队列 #${job.id} 票据缩略图`}
                        className="exp-job__thumb"
                        decoding="async"
                        loading="lazy"
                        src={receiptImageUrl(job.image_path) ?? undefined}
                      />
                    ) : null}
                    <div className="exp-job__main">
                      <span className={`exp-tag ${job.status === "failed" ? "exp-tag--warn" : "exp-tag--neutral"}`}>
                        {jobStatusLabel(job.status)}
                      </span>
                      <div className="exp-job__name">{jobDisplayName(job)}</div>
                      <div className="exp-card__meta">
                        已尝试 {job.attempts} 次
                        {job.last_attempt_at ? ` · 上次 ${new Date(job.last_attempt_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}
                        {job.next_attempt_at ? ` · 下次 ${new Date(job.next_attempt_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </div>
                      {job.error_message ? (
                        <div className="exp-job__error" title={job.error_message}>
                          {shortJobError(job.error_message)}
                        </div>
                      ) : null}
                    </div>
                    <div className="exp-job__actions">
                      <button
                        className="exp-btn exp-btn--secondary exp-btn--sm"
                        disabled={job.status === "dead"}
                        onClick={() => void retryJob(job)}
                        title={
                          job.status === "dead"
                            ? `已尝试 ${job.attempts} 次，请删除后重新上传`
                            : undefined
                        }
                        type="button"
                      >
                        {job.status === "dead" ? "已达重试上限" : "立即重试"}
                      </button>
                      <button className="exp-btn exp-btn--ghost exp-btn--sm" onClick={() => void deleteJob(job)} type="button">
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="exp-grid exp-grid--aside">
            <div className="exp-col">
              <HeroRing
                budget={fromCents(analytics.budget_progress.budget)}
                currency={analytics.budget_currency}
                dailyBudget={fromCents(analytics.budget_progress.remaining) / Math.max(1, days)}
                daysRemaining={days}
                otherCurrencies={otherCurrencies}
                projectedMonthEnd={analytics.projected_month_end_spend}
                projectedOverBudget={analytics.projected_over_budget}
                spent={fromCents(analytics.budget_progress.spent)}
              />
            </div>
            <div className="exp-col">
              <CategoryDonut
                categoryBreakdown={analytics.category_breakdown}
                currency={analytics.budget_currency}
                otherCurrenciesText={otherCurrenciesText}
              />
            </div>
          </div>

          <div className="exp-grid exp-grid--equal">
            <section className="exp-col">
              <div className="exp-col__head">
                <h2 className="exp-section-title">
                  <span aria-hidden>🧾</span>
                  待确认
                  <span className="exp-section-title__count">{analytics.pending_receipts.length}</span>
                </h2>
              </div>
              {analytics.pending_receipts.length === 0 ? (
                <div className="exp-empty exp-card">
                  <div className="exp-empty__icon" aria-hidden>✨</div>
                  <div>没有待确认票据</div>
                </div>
              ) : (
                <div className="exp-col__scroll">
                  {analytics.pending_receipts.map((receipt) => (
                    <PendingReceiptCard
                      draft={pendingDrafts[receipt.id] ?? receipt.extracted}
                      key={receipt.id}
                      onDelete={() => void deletePending(receipt)}
                      onDraftChange={(next) =>
                        setPendingDrafts((current) => ({ ...current, [receipt.id]: next }))
                      }
                      onSave={() => void confirmPending(receipt)}
                      receipt={receipt}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="exp-col">
              <div className="exp-col__head">
                <h2 className="exp-section-title">
                  <span aria-hidden>📚</span>
                  已入账
                  <span className="exp-section-title__count">{analytics.recent_transactions.length}</span>
                </h2>
                {/* Wave 2 feature: full list — link to the all-transactions page */}
                <a className="exp-btn exp-btn--ghost exp-btn--sm" href="/expenses/all">
                  查看全部 →
                </a>
              </div>
              {analytics.recent_transactions.length === 0 ? (
                <div className="exp-empty exp-card">
                  <div className="exp-empty__icon" aria-hidden>📒</div>
                  <div>还没有入账消费</div>
                </div>
              ) : (
                <div className="exp-col__scroll">
                  {analytics.recent_transactions.map((transaction) => (
                    <TransactionCard
                      draft={transactionDrafts[transaction.id] ?? transactionToExtracted(transaction)}
                      key={transaction.id}
                      onDelete={() => void deletePosted(transaction)}
                      onDraftChange={(next) =>
                        setTransactionDrafts((current) => ({ ...current, [transaction.id]: next }))
                      }
                      onSave={() => void updatePosted(transaction)}
                      transaction={transaction}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
      </BulkSelectionProvider>
    </div>
  );
}
