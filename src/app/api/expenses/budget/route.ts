import { NextRequest, NextResponse } from "next/server";

import {
  addExpenseBudgetTopUp,
  deleteExpenseBudgetTopUp,
  getExpenseBudgetSettings,
  getExpenseBudgetTopUpCents,
  listExpenseBudgetTopUps,
  setExpenseBudgetSettings
} from "@/lib/expenses/budget-settings-store";
import { DEFAULT_PRIMARY_CURRENCY, SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/expenses/settings";

export const runtime = "nodejs";

function jsonForMonth(month: string) {
  const settings = getExpenseBudgetSettings();
  const topUps = listExpenseBudgetTopUps(month);
  const topUpCents = getExpenseBudgetTopUpCents(month);
  return {
    month,
    baseBudgetCents: settings.baseBudgetCents,
    primaryCurrency: settings.primaryCurrency,
    budgetTopUpCents: topUpCents,
    monthlyBudgetCents: settings.baseBudgetCents + topUpCents,
    topUps,
    hasServerSettings: settings.hasServerSettings
  };
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month") ?? currentMonth();
  return NextResponse.json(jsonForMonth(month));
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const baseBudgetCents = Number(body?.baseBudgetCents);
  const primaryCurrency = String(body?.primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY);
  if (!Number.isFinite(baseBudgetCents) || baseBudgetCents <= 0) {
    return NextResponse.json({ error: "Invalid baseBudgetCents" }, { status: 400 });
  }
  if (!SUPPORTED_CURRENCIES.includes(primaryCurrency as SupportedCurrency)) {
    return NextResponse.json({ error: "Invalid primaryCurrency" }, { status: 400 });
  }
  setExpenseBudgetSettings({ baseBudgetCents, primaryCurrency });
  const month = typeof body?.month === "string" ? body.month : currentMonth();
  return NextResponse.json(jsonForMonth(month));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const month = String(body?.month ?? "");
  const amountCents = Number(body?.amountCents);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Invalid amountCents" }, { status: 400 });
  }
  addExpenseBudgetTopUp({
    month,
    amountCents,
    note: typeof body?.note === "string" ? body.note : null
  });
  return NextResponse.json(jsonForMonth(month), { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const month = request.nextUrl.searchParams.get("month") ?? currentMonth();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  deleteExpenseBudgetTopUp(id);
  return NextResponse.json(jsonForMonth(month));
}
