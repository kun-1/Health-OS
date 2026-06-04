import { NextRequest, NextResponse } from "next/server";

import { db, rawDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { supplementSchedules } from "@/db/schema";

export const runtime = "nodejs";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = rawDb.prepare("SELECT * FROM supplement_schedules WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body.supplement_name === "string" && body.supplement_name.trim()) {
    updates.supplementName = body.supplement_name.trim();
  }
  if (body.brand !== undefined) {
    updates.brand = typeof body.brand === "string" ? body.brand.trim() : null;
  }
  if (body.dose_text !== undefined) {
    updates.doseText = typeof body.dose_text === "string" ? body.dose_text.trim() : null;
  }
  if (typeof body.time_of_day === "string" && ["breakfast", "lunch", "dinner", "bedtime"].includes(body.time_of_day)) {
    updates.timeOfDay = body.time_of_day;
  }
  if (body.days_of_week !== undefined) {
    if (!Array.isArray(body.days_of_week) || body.days_of_week.length === 0) {
      return NextResponse.json({ error: "days_of_week must be non-empty array" }, { status: 400 });
    }
    updates.daysOfWeek = JSON.stringify(body.days_of_week);
  }
  if (body.active !== undefined) {
    updates.active = body.active === false ? 0 : 1;
  }

  db.update(supplementSchedules).set(updates).where(eq(supplementSchedules.id, id)).run();
  const updated = rawDb.prepare("SELECT * FROM supplement_schedules WHERE id = ?").get(id);
  return NextResponse.json({ schedule: updated });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = rawDb.prepare("SELECT * FROM supplement_schedules WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  db.delete(supplementSchedules).where(eq(supplementSchedules.id, id)).run();
  return NextResponse.json({ ok: true });
}
