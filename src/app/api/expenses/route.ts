import { NextRequest, NextResponse } from "next/server";

import { ensureExpenseSchedulerStarted } from "@/lib/expenses/scheduler-startup";
import { DEFAULT_EXPENSE_TZ, getExpenseAnalytics } from "@/lib/expenses/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  ensureExpenseSchedulerStarted();
  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  // Wave 1 fix (Bug #9): honour a user-supplied IANA timezone so month
  // boundaries match the user's local calendar. Fall back to Asia/Shanghai.
  const tz = request.nextUrl.searchParams.get("tz") ?? DEFAULT_EXPENSE_TZ;
  // Wave 2 feature: budget settings — caller (the page) sends its localStorage
  // values as query params. The server never reads localStorage; it just
  // trusts the values (single-user app). Missing/empty falls back to the
  // hardcoded constant inside getExpenseAnalytics.
  const budgetParam = request.nextUrl.searchParams.get("budget");
  const currencyParam = request.nextUrl.searchParams.get("primaryCurrency");
  const overrides: { budgetCents?: number | null; primaryCurrency?: string | null } = {};
  if (budgetParam !== null) {
    const parsed = Number(budgetParam);
    overrides.budgetCents = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }
  if (currencyParam !== null && currencyParam.length > 0) {
    overrides.primaryCurrency = currencyParam;
  }
  return NextResponse.json(getExpenseAnalytics(month, tz, overrides));
}
