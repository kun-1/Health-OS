import { NextRequest, NextResponse } from "next/server";

import { migrateLocalBudgetSettings } from "@/lib/expenses/budget-settings-store";
import type { BudgetTopUp } from "@/lib/expenses/settings";

export const runtime = "nodejs";

function isBudgetTopUp(value: unknown): value is BudgetTopUp {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.month === "string" &&
    /^\d{4}-\d{2}$/.test(row.month) &&
    typeof row.amountCents === "number" &&
    Number.isFinite(row.amountCents) &&
    row.amountCents > 0 &&
    (row.note === null || typeof row.note === "string")
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const budgetCents = Number(body?.budgetCents);
  const topUps = Array.isArray(body?.topUps) ? body.topUps.filter(isBudgetTopUp) : [];
  const settings = migrateLocalBudgetSettings({
    budgetCents: Number.isFinite(budgetCents) && budgetCents > 0 ? Math.round(budgetCents) : null,
    primaryCurrency: typeof body?.primaryCurrency === "string" ? body.primaryCurrency : null,
    topUps
  });
  return NextResponse.json(settings);
}
