import { NextRequest, NextResponse } from "next/server";

import {
  deleteRecord,
  getRecordById,
  recordIsReferenced,
  recordExistsWithType,
  updateRecord
} from "@/lib/records/store";
import { createRecordSchema } from "@/lib/records/validation";

export const runtime = "nodejs";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    return NextResponse.json({ record: getRecordById(id) });
  } catch {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = (() => {
    try {
      return getRecordById(id);
    } catch {
      return null;
    }
  })();

  if (!existing) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createRecordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid record", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.type !== existing.type) {
    return NextResponse.json({ error: "Record type mismatch" }, { status: 400 });
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

  try {
    const record = updateRecord(id, parsed.data);
    return NextResponse.json({ record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update record";
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    getRecordById(id);
  } catch {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  if (recordIsReferenced(id)) {
    return NextResponse.json({ error: "This record is referenced by another record and cannot be deleted" }, { status: 409 });
  }

  deleteRecord(id);
  return NextResponse.json({ ok: true });
}
