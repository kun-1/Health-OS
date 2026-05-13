import { NextRequest, NextResponse } from "next/server";

import { createRecord, decodeCursor, listRecords, recordExistsWithType } from "@/lib/records/store";
import { createRecordSchema, getRecordsQuerySchema } from "@/lib/records/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createRecordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid record", details: parsed.error.flatten() }, { status: 400 });
  }

  const { type, payload } = parsed.data;
  if (type === "post_meal_symptom" && !recordExistsWithType(payload.related_record_id, "meal")) {
    return NextResponse.json({ error: "related_record_id must point to a meal record" }, { status: 400 });
  }

  if (
    type === "supplement" &&
    payload.related_record_id !== undefined &&
    !recordExistsWithType(payload.related_record_id, "meal")
  ) {
    return NextResponse.json({ error: "related_record_id must point to a meal record" }, { status: 400 });
  }

  const record = createRecord(parsed.data);
  return NextResponse.json({ record }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const parsed = getRecordsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : undefined;
  if (parsed.data.cursor && !cursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  return NextResponse.json(listRecords(parsed.data.limit, cursor ?? undefined));
}
