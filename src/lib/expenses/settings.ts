// Wave 2 feature: budget settings — user-tweakable monthly budget and primary
// currency. Stored in localStorage because the app is single-user and we don't
// want to bloat the schema with a one-row settings table.

export const STORAGE_KEY_BUDGET = "expenses.budget";
export const STORAGE_KEY_PRIMARY_CURRENCY = "expenses.primaryCurrency";
export const STORAGE_KEY_BUDGET_TOP_UPS = "expenses.budgetTopUps.v1";

export const DEFAULT_BUDGET_CENTS = 200000; // ¥2000.00
export const DEFAULT_PRIMARY_CURRENCY = "CNY";
export const SUPPORTED_CURRENCIES = ["CNY", "USD", "EUR", "JPY"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export type BudgetTopUp = {
  id: string;
  month: string;
  amountCents: number;
  note: string | null;
  createdAt: string;
};

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

function isBudgetTopUp(value: unknown): value is BudgetTopUp {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    /^\d{4}-\d{2}$/.test(String(row.month)) &&
    typeof row.amountCents === "number" &&
    Number.isFinite(row.amountCents) &&
    row.amountCents > 0 &&
    (row.note === null || typeof row.note === "string") &&
    typeof row.createdAt === "string"
  );
}

export function readStoredBudgetTopUps(): BudgetTopUp[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY_BUDGET_TOP_UPS);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isBudgetTopUp)
      .map((entry) => ({
        ...entry,
        amountCents: Math.round(entry.amountCents),
        note: entry.note?.trim() ? entry.note.trim() : null
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

function writeStoredBudgetTopUps(entries: BudgetTopUp[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_BUDGET_TOP_UPS, JSON.stringify(entries));
}

export function getStoredBudgetTopUps(month: string): BudgetTopUp[] {
  return readStoredBudgetTopUps().filter((entry) => entry.month === month);
}

export function getStoredBudgetTopUpCents(month: string): number {
  return getStoredBudgetTopUps(month).reduce((sum, entry) => sum + entry.amountCents, 0);
}

export function addStoredBudgetTopUp(input: {
  month: string;
  amountCents: number;
  note?: string | null;
}): BudgetTopUp {
  const entry: BudgetTopUp = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    month: input.month,
    amountCents: Math.max(1, Math.round(input.amountCents)),
    note: input.note?.trim() ? input.note.trim() : null,
    createdAt: new Date().toISOString()
  };
  writeStoredBudgetTopUps([entry, ...readStoredBudgetTopUps()]);
  return entry;
}

export function deleteStoredBudgetTopUp(id: string): void {
  writeStoredBudgetTopUps(readStoredBudgetTopUps().filter((entry) => entry.id !== id));
}
