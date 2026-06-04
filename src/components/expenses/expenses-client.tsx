"use client";

import { useCallback, useEffect, useState } from "react";

import type { ExpenseAnalytics, ExpenseReceiptSummary, ExpenseTransaction, ExtractedExpenseReceipt } from "@/lib/expenses/types";

import { CategoryDonut } from "./category-donut";
import { HeroRing } from "./hero-ring";
import { PendingReceiptCard } from "./pending-card";
import { ReceiptUploader } from "./receipt-uploader";
import { ThemeToggle, getInitialTheme, type Theme } from "./theme-toggle";
import { TransactionCard } from "./transaction-card";
import "./expenses.css";

type UploadTiming = {
  filename?: string;
  provider?: string;
  model?: string;
  total_ms?: number;
  ocr_ms?: number;
};

type UploadFailure = { filename?: string; error: string; timing?: UploadTiming };

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
      unit_price: item.unit_price,
      amount: item.amount,
      confidence: item.confidence,
      notes: item.notes
    }))
  };
}

export function ExpensesClient() {
  const [month, setMonth] = useState(currentMonth());
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [pendingDrafts, setPendingDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});
  const [transactionDrafts, setTransactionDrafts] = useState<Record<number, ExtractedExpenseReceipt>>({});

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("expenses-theme", theme);
  }, [theme]);

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/expenses?month=${encodeURIComponent(month)}`);
    if (!response.ok) {
      setError("消费数据加载失败");
      return;
    }
    const data = (await response.json()) as ExpenseAnalytics;
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
    load().catch(() => setError("消费数据加载失败"));
  }, [load]);

  async function uploadReceipt(formData: FormData) {
    setError("");
    setMessage("");
    const response = await fetch("/api/expenses/receipts", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
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
    const summary = receipts.map((r) => `#${r.id} 已处理`).join("，");
    const failureText = failures.length
      ? `；失败 ${failures.length} 张：${failures.map((f) => f.filename ?? "图片").join("、")}`
      : "";
    setMessage(`${summary || "识别完成"}${failureText}${uploadTimingSummary(timings, data.total_ms)}`);
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

  const currency = analytics?.recent_transactions[0]?.currency ?? "CNY";
  const days = analytics ? daysRemainingInMonth(analytics.month) : 0;

  return (
    <div className="exp" data-expenses-theme={theme}>
      <header className="exp-header">
        <div>
          <h1 className="exp-header__title">生活支出</h1>
          <p className="exp-header__subtitle">拍票据，自动入账 · 看月预算，分分类</p>
        </div>
        <div className="exp-header__right">
          <label className="exp-month">
            <span aria-hidden>📅</span>
            <input
              onChange={(event) => setMonth(event.target.value)}
              type="month"
              value={month}
            />
          </label>
          <ThemeToggle onChange={setTheme} theme={theme} />
        </div>
      </header>

      {error ? <div className="exp-banner exp-banner--error">{error}</div> : null}
      {message ? <div className="exp-banner exp-banner--ok">{message}</div> : null}

      <ReceiptUploader
        hint="支持 JPG / PNG / WEBP。一次最多 2 张，每张不超过 8MB。"
        maxBytesPerFile={8 * 1024 * 1024}
        maxFiles={2}
        onUpload={uploadReceipt}
      />

      {analytics ? (
        <>
          <div className="exp-grid exp-grid--aside">
            <div className="exp-col">
              <HeroRing
                budget={analytics.monthly_budget}
                currency={currency}
                dailyBudget={analytics.remaining_daily_budget}
                daysRemaining={days}
                projectedMonthEnd={analytics.projected_month_end_spend}
                projectedOverBudget={analytics.projected_over_budget}
                spent={analytics.spent_this_month}
              />
            </div>
            <div className="exp-col">
              <CategoryDonut categoryTotals={analytics.category_totals} currency={currency} />
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
    </div>
  );
}
