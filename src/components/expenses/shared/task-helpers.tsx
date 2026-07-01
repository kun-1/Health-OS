/**
 * Shared pure helpers and small components used by BudgetTask,
 * StructureTask, ReceiptsTask, and the expense sub-pages.
 *
 * Kept in one file because every consumer pulls in 2+ of these and the
 * items here have no React state — tree-shaking still drops anything a
 * page does not actually touch.
 */

import type {
  ExpenseAnalytics,
  ExpenseTransaction,
  ExtractedExpenseReceipt
} from "@/lib/expenses/types";

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
  category_zh: ExpenseAnalytics["category_breakdown"][number]["category_zh"];
  amount: number | null;
  notes: string | null;
  currency: string;
  excludedFromBudget?: boolean;
};

export type LoadError = { kind: "network" | "server" | "client"; message: string };

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

/**
 * Compact "6月10日" style date for transaction / receipt rows. Sourced
 * from the zh-CN locale with the same Asia/Shanghai TZ pinning as
 * formatDate so the server and client first render produce the same
 * string (avoids hydration warnings). Returns the provided fallback when
 * the input is null or unparseable.
 */
export function shortChineseDate(value: string | null | undefined, fallback = "日期待补"): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Shanghai"
  }).format(d);
}

export function formatMoneyCompact(value: number, currency: string) {
  return new Intl.NumberFormat("zh-CN", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}
