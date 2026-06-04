import { NextRequest, NextResponse } from "next/server";

import { db, rawDb } from "@/lib/db";
import { supplementSchedules } from "@/db/schema";

export const runtime = "nodejs";

function now() {
  return new Date().toISOString();
}

export async function GET() {
  const rows = db.select().from(supplementSchedules).orderBy(supplementSchedules.supplementName).all();
  return NextResponse.json({ schedules: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.supplement_name !== "string" || !body.supplement_name.trim()) {
    return NextResponse.json({ error: "supplement_name is required" }, { status: 400 });
  }
  if (typeof body.time_of_day !== "string" || !["breakfast", "lunch", "dinner", "bedtime"].includes(body.time_of_day)) {
    return NextResponse.json({ error: "time_of_day must be breakfast/lunch/dinner/bedtime" }, { status: 400 });
  }
  if (!Array.isArray(body.days_of_week) || body.days_of_week.length === 0) {
    return NextResponse.json({ error: "days_of_week must be a non-empty array" }, { status: 400 });
  }

  const nowStr = now();
  const result = db
    .insert(supplementSchedules)
    .values({
      supplementName: body.supplement_name.trim(),
      brand: typeof body.brand === "string" ? body.brand.trim() : null,
      doseText: typeof body.dose_text === "string" ? body.dose_text.trim() : null,
      timeOfDay: body.time_of_day,
      daysOfWeek: JSON.stringify(body.days_of_week),
      active: body.active === false ? 0 : 1,
      createdAt: nowStr,
      updatedAt: nowStr
    })
    .run();

  const created = rawDb.prepare("SELECT * FROM supplement_schedules WHERE id = ?").get(Number(result.lastInsertRowid));
  return NextResponse.json({ schedule: created }, { status: 201 });
}
