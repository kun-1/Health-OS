import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createRecurringExpense,
  deleteRecurringExpense,
  getRecurringExpense,
  listRecurringExpenses,
  updateRecurringExpense,
  type RecurringExpenseInput
} from "@/lib/expenses/store";
import {
  recurringExpensePatchSchema,
  recurringExpenseSchema
} from "@/lib/expenses/validation";

export const runtime = "nodejs";

// Wave 3 subscription: list (no filter) / create.
// PATCH/DELETE carry the rule id in the body so we don't need a [id] route
// file — the spec asked for all four verbs in this one route.ts.
export async function GET(request: NextRequest) {
  const activeParam = request.nextUrl.searchParams.get("active");
  if (activeParam === "true") {
    return NextResponse.json({ rules: listRecurringExpenses({ active: true }) });
  }
  if (activeParam === "false") {
    return NextResponse.json({ rules: listRecurringExpenses({ active: false }) });
  }
  return NextResponse.json({ rules: listRecurringExpenses() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = recurringExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid recurring rule", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const rule = createRecurringExpense({
      merchantName: parsed.data.merchantName,
      amountCents: parsed.data.amountCents,
      currency: parsed.data.currency,
      categoryZh: parsed.data.categoryZh,
      frequency: parsed.data.frequency,
      dayOfMonth: parsed.data.dayOfMonth ?? null,
      dayOfWeek: parsed.data.dayOfWeek ?? null,
      monthOfYear: parsed.data.monthOfYear ?? null,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate ?? null,
      notes: parsed.data.notes ?? null,
      excludedFromBudget: parsed.data.excludedFromBudget
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 }
    );
  }
}

const idSchema = z.object({ id: z.number().int().positive() });
const patchBodySchema = idSchema.and(recurringExpensePatchSchema);

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid patch", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  // Verify the id exists so a PATCH on a missing rule returns 404 instead
  // of silently no-op'ing through updateRecurringExpense.
  try {
    getRecurringExpense(id);
  } catch {
    return NextResponse.json({ error: `Recurring expense ${id} not found` }, { status: 404 });
  }
  const input: Partial<RecurringExpenseInput> & { active?: boolean } = {};
  if (patch.merchantName !== undefined) input.merchantName = patch.merchantName;
  if (patch.amountCents !== undefined) input.amountCents = patch.amountCents;
  if (patch.currency !== undefined) input.currency = patch.currency;
  if (patch.categoryZh !== undefined) input.categoryZh = patch.categoryZh;
  if (patch.frequency !== undefined) input.frequency = patch.frequency;
  if (patch.dayOfMonth !== undefined) input.dayOfMonth = patch.dayOfMonth;
  if (patch.dayOfWeek !== undefined) input.dayOfWeek = patch.dayOfWeek;
  if (patch.monthOfYear !== undefined) input.monthOfYear = patch.monthOfYear;
  if (patch.startDate !== undefined) input.startDate = patch.startDate;
  if (patch.endDate !== undefined) input.endDate = patch.endDate;
  if (patch.notes !== undefined) input.notes = patch.notes;
  if (patch.excludedFromBudget !== undefined) input.excludedFromBudget = patch.excludedFromBudget;
  if (patch.active !== undefined) input.active = patch.active;
  try {
    const rule = updateRecurringExpense(id, input);
    return NextResponse.json({ rule });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 }
    );
  }
}

const deleteBodySchema = idSchema;

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = deleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid id", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const rule = deleteRecurringExpense(parsed.data.id);
    return NextResponse.json({ rule });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 404 }
    );
  }
}
