import { rawDb } from "@/lib/db";
import {
  DEFAULT_BUDGET_CENTS,
  DEFAULT_PRIMARY_CURRENCY,
  SUPPORTED_CURRENCIES,
  type BudgetTopUp,
  type SupportedCurrency
} from "@/lib/expenses/settings";

type BudgetSettingsRow = {
  id: number;
  base_budget_cents: number;
  primary_currency: string;
  created_at: string;
  updated_at: string;
};

type BudgetTopUpRow = {
  id: string;
  month: string;
  amount_cents: number;
  note: string | null;
  created_at: string;
};

export type ExpenseBudgetSettings = {
  baseBudgetCents: number;
  primaryCurrency: SupportedCurrency;
  hasServerSettings: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeCurrency(value: string | null | undefined): SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency)
    ? (value as SupportedCurrency)
    : DEFAULT_PRIMARY_CURRENCY;
}

function topUpFromRow(row: BudgetTopUpRow): BudgetTopUp {
  return {
    id: row.id,
    month: row.month,
    amountCents: row.amount_cents,
    note: row.note,
    createdAt: row.created_at
  };
}

export function getExpenseBudgetSettings(): ExpenseBudgetSettings {
  const row = rawDb
    .prepare("SELECT * FROM expense_budget_settings WHERE id = 1")
    .get() as BudgetSettingsRow | undefined;
  if (!row) {
    return {
      baseBudgetCents: DEFAULT_BUDGET_CENTS,
      primaryCurrency: DEFAULT_PRIMARY_CURRENCY,
      hasServerSettings: false
    };
  }
  return {
    baseBudgetCents: row.base_budget_cents > 0 ? row.base_budget_cents : DEFAULT_BUDGET_CENTS,
    primaryCurrency: normalizeCurrency(row.primary_currency),
    hasServerSettings: true
  };
}

export function setExpenseBudgetSettings(input: {
  baseBudgetCents: number;
  primaryCurrency: string;
}): ExpenseBudgetSettings {
  const baseBudgetCents = Math.max(1, Math.round(input.baseBudgetCents));
  const primaryCurrency = normalizeCurrency(input.primaryCurrency);
  const now = nowIso();
  rawDb
    .prepare(
      `INSERT INTO expense_budget_settings (id, base_budget_cents, primary_currency, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         base_budget_cents = excluded.base_budget_cents,
         primary_currency = excluded.primary_currency,
         updated_at = excluded.updated_at`
    )
    .run(baseBudgetCents, primaryCurrency, now, now);
  return { baseBudgetCents, primaryCurrency, hasServerSettings: true };
}

export function listExpenseBudgetTopUps(month: string): BudgetTopUp[] {
  const rows = rawDb
    .prepare(
      `SELECT id, month, amount_cents, note, created_at
       FROM expense_budget_top_ups
       WHERE month = ?
       ORDER BY created_at DESC`
    )
    .all(month) as BudgetTopUpRow[];
  return rows.map(topUpFromRow);
}

export function getExpenseBudgetTopUpCents(month: string): number {
  const row = rawDb
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM expense_budget_top_ups WHERE month = ?")
    .get(month) as { total: number } | undefined;
  return Math.max(0, Math.round(row?.total ?? 0));
}

export function addExpenseBudgetTopUp(input: {
  month: string;
  amountCents: number;
  note?: string | null;
  id?: string;
  createdAt?: string;
}): BudgetTopUp {
  const entry: BudgetTopUp = {
    id: input.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    month: input.month,
    amountCents: Math.max(1, Math.round(input.amountCents)),
    note: input.note?.trim() ? input.note.trim() : null,
    createdAt: input.createdAt ?? nowIso()
  };
  rawDb
    .prepare(
      `INSERT OR IGNORE INTO expense_budget_top_ups (id, month, amount_cents, note, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(entry.id, entry.month, entry.amountCents, entry.note, entry.createdAt);
  return entry;
}

export function deleteExpenseBudgetTopUp(id: string): void {
  rawDb.prepare("DELETE FROM expense_budget_top_ups WHERE id = ?").run(id);
}

export function getExpenseBudgetConfig(month: string): {
  budgetCents: number;
  budgetTopUpCents: number;
  primaryCurrency: SupportedCurrency;
} {
  const settings = getExpenseBudgetSettings();
  const budgetTopUpCents = getExpenseBudgetTopUpCents(month);
  return {
    budgetCents: settings.baseBudgetCents,
    budgetTopUpCents,
    primaryCurrency: settings.primaryCurrency
  };
}

export function migrateLocalBudgetSettings(input: {
  budgetCents?: number | null;
  primaryCurrency?: string | null;
  topUps?: BudgetTopUp[];
}): ExpenseBudgetSettings {
  const current = getExpenseBudgetSettings();
  const hasLegacyBudget = typeof input.budgetCents === "number" && input.budgetCents > 0;
  const legacyBudgetCents = hasLegacyBudget ? Math.round(input.budgetCents as number) : null;
  const shouldUseLegacyBudget =
    legacyBudgetCents !== null &&
    (!current.hasServerSettings ||
      (current.baseBudgetCents === DEFAULT_BUDGET_CENTS && legacyBudgetCents !== DEFAULT_BUDGET_CENTS));
  if (shouldUseLegacyBudget || (!current.hasServerSettings && input.primaryCurrency)) {
    const baseBudgetCents = hasLegacyBudget ? Math.round(input.budgetCents as number) : DEFAULT_BUDGET_CENTS;
    setExpenseBudgetSettings({
      baseBudgetCents: shouldUseLegacyBudget ? legacyBudgetCents : baseBudgetCents,
      primaryCurrency: input.primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY
    });
  }

  const existingTopUps = rawDb
    .prepare("SELECT COUNT(*) AS count FROM expense_budget_top_ups")
    .get() as { count: number } | undefined;
  if ((existingTopUps?.count ?? 0) === 0) {
    for (const entry of input.topUps ?? []) {
      if (!entry.month || !entry.amountCents) continue;
      addExpenseBudgetTopUp({
        id: entry.id,
        month: entry.month,
        amountCents: entry.amountCents,
        note: entry.note,
        createdAt: entry.createdAt
      });
    }
  }

  return getExpenseBudgetSettings();
}
