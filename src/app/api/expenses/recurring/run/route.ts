import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { bumpRecurringExpenseNextRun, getRecurringExpense } from "@/lib/expenses/store";
import { runRecurringTick } from "@/lib/expenses/scheduler";

export const runtime = "nodejs";

// Wave 3 subscription: "立即跑一次" — bump the rule's nextRunAt to now AND
// fire the recurring tick synchronously so the UI sees the new transaction
// without waiting for the next 1h tick. The tick processes every due rule,
// not just this one, so concurrent natural firings (e.g. a daily rule whose
// hour just hit) are also flushed in the same call. Idempotent: clicking
// the button twice creates two transactions, but that's the same behaviour
// as clicking it manually and waiting an hour.
const bodySchema = z.object({ id: z.number().int().positive() });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid id", details: parsed.error.flatten() }, { status: 400 });
  }
  let rule;
  try {
    rule = getRecurringExpense(parsed.data.id);
  } catch {
    return NextResponse.json({ error: `Recurring expense ${parsed.data.id} not found` }, { status: 404 });
  }
  if (!rule.active) {
    return NextResponse.json({ error: "Recurring expense is inactive" }, { status: 400 });
  }
  const now = new Date();
  bumpRecurringExpenseNextRun(rule.id, now);
  const summary = await runRecurringTick();
  return NextResponse.json({ ok: true, summary });
}
