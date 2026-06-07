// Wave 2 feature: budget settings — user-tweakable monthly budget and primary
// currency. Stored in localStorage because the app is single-user and we don't
// want to bloat the schema with a one-row settings table.

export const STORAGE_KEY_BUDGET = "expenses.budget";
export const STORAGE_KEY_PRIMARY_CURRENCY = "expenses.primaryCurrency";

export const DEFAULT_BUDGET_CENTS = 200000; // ¥2000.00
export const DEFAULT_PRIMARY_CURRENCY = "CNY";
export const SUPPORTED_CURRENCIES = ["CNY", "USD", "EUR", "JPY"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function getStoredBudgetCents(): number {
  if (typeof window === "undefined") return DEFAULT_BUDGET_CENTS;
  const raw = window.localStorage.getItem(STORAGE_KEY_BUDGET);
  if (!raw) return DEFAULT_BUDGET_CENTS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : DEFAULT_BUDGET_CENTS;
}

export function getStoredPrimaryCurrency(): SupportedCurrency {
  if (typeof window === "undefined") return DEFAULT_PRIMARY_CURRENCY;
  const raw = window.localStorage.getItem(STORAGE_KEY_PRIMARY_CURRENCY);
  return raw && isSupportedCurrency(raw) ? raw : DEFAULT_PRIMARY_CURRENCY;
}

export function setStoredBudgetCents(cents: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_BUDGET, String(Math.max(1, Math.round(cents))));
}

export function setStoredPrimaryCurrency(currency: SupportedCurrency): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_PRIMARY_CURRENCY, currency);
}
