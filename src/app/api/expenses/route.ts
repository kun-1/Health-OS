import { NextRequest, NextResponse } from "next/server";

import { getExpenseBudgetConfig } from "@/lib/expenses/budget-settings-store";
import { ensureExpenseSchedulerStarted } from "@/lib/expenses/scheduler-startup";
import { DEFAULT_EXPENSE_TZ, getExpenseAnalytics } from "@/lib/expenses/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  ensureExpenseSchedulerStarted();
  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  // Wave 1 fix (Bug #9): honour a user-supplied IANA timezone so month
  // boundaries match the user's local calendar. Fall back to Asia/Shanghai.
  const tz = request.nextUrl.searchParams.get("tz") ?? DEFAULT_EXPENSE_TZ;
  const budgetConfig = getExpenseBudgetConfig(month ?? new Date().toISOString().slice(0, 7));
  return NextResponse.json(getExpenseAnalytics(month, tz, budgetConfig));
}
