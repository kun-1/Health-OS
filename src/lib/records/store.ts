import { and, desc, eq, lt, or } from "drizzle-orm";

import { records, type RecordRow } from "@/db/schema";
import { db, rawDb } from "@/lib/db";
import type { RecordType, TimelineRecord } from "@/lib/records/types";

type Cursor = {
  occurred_at: string;
  id: number;
};

type CreateRecordInput = {
  type: RecordType;
  occurred_at: string;
  payload: Record<string, unknown>;
};

type UpdateRecordInput = CreateRecordInput;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (typeof parsed.occurred_at !== "string" || typeof parsed.id !== "number") {
      return null;
    }
    return { occurred_at: parsed.occurred_at, id: parsed.id };
  } catch {
    return null;
  }
}

function toTimelineRecord(row: RecordRow): TimelineRecord {
  return {
    id: row.id,
    type: row.type as RecordType,
    occurred_at: row.occurredAt,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

export function recordExistsWithType(id: number, type: RecordType): boolean {
  const row = db
    .select({ id: records.id })
    .from(records)
    .where(and(eq(records.id, id), eq(records.type, type)))
    .limit(1)
    .get();
  return Boolean(row);
}

export function recordIsReferenced(id: number): boolean {
  const row = rawDb
    .prepare(
      `
        SELECT 1
        FROM records
        WHERE json_extract(payload_json, '$.related_record_id') = ?
        LIMIT 1
      `
    )
    .get(id);
  return Boolean(row);
}

function findUpsertTarget(type: "daily_summary" | "sleep", dateField: "summary_date" | "sleep_date", date: string) {
  return rawDb
    .prepare(
      `
        SELECT id
        FROM records
        WHERE type = ?
          AND json_extract(payload_json, ?) = ?
        LIMIT 1
      `
    )
    .get(type, `$.${dateField}`, date) as { id: number } | undefined;
}

export function createRecord(input: CreateRecordInput): TimelineRecord {
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(input.payload);

  if (input.type === "daily_summary") {
    const target = findUpsertTarget("daily_summary", "summary_date", String(input.payload.summary_date));
    if (target) {
      db.update(records)
        .set({ occurredAt: input.occurred_at, payloadJson, updatedAt: now })
        .where(eq(records.id, target.id))
        .run();
      return getRecordById(target.id);
    }
  }

  if (input.type === "sleep") {
    const target = findUpsertTarget("sleep", "sleep_date", String(input.payload.sleep_date));
    if (target) {
      db.update(records)
        .set({ occurredAt: input.occurred_at, payloadJson, updatedAt: now })
        .where(eq(records.id, target.id))
        .run();
      return getRecordById(target.id);
    }
  }

  const result = db
    .insert(records)
    .values({
      type: input.type,
      occurredAt: input.occurred_at,
      payloadJson,
      createdAt: now,
      updatedAt: now
    })
    .run();

  return getRecordById(Number(result.lastInsertRowid));
}

export function updateRecord(id: number, input: UpdateRecordInput): TimelineRecord {
  const existing = getRecordById(id);
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(input.payload);

  if (existing.type !== input.type) {
    throw new Error("Record type mismatch");
  }

  if (input.type === "daily_summary") {
    const target = findUpsertTarget("daily_summary", "summary_date", String(input.payload.summary_date));
    if (target && target.id !== id) {
      throw new Error("daily_summary already exists for that summary_date");
    }
  }

  if (input.type === "sleep") {
    const target = findUpsertTarget("sleep", "sleep_date", String(input.payload.sleep_date));
    if (target && target.id !== id) {
      throw new Error("sleep already exists for that sleep_date");
    }
  }

  db.update(records)
    .set({
      occurredAt: input.occurred_at,
      payloadJson,
      updatedAt: now
    })
    .where(eq(records.id, id))
    .run();

  return getRecordById(id);
}

export function deleteRecord(id: number): void {
  db.delete(records).where(eq(records.id, id)).run();
}

export function getRecordById(id: number): TimelineRecord {
  const row = db.select().from(records).where(eq(records.id, id)).get();
  if (!row) {
    throw new Error(`Record ${id} not found`);
  }
  return toTimelineRecord(row);
}

export function listRecords(limit: number, cursor?: Cursor) {
  const rows = db
    .select()
    .from(records)
    .where(
      cursor
        ? or(
            lt(records.occurredAt, cursor.occurred_at),
            and(eq(records.occurredAt, cursor.occurred_at), lt(records.id, cursor.id))
          )
        : undefined
    )
    .orderBy(desc(records.occurredAt), desc(records.id))
    .limit(limit + 1)
    .all();

  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);

  return {
    records: pageRows.map(toTimelineRecord),
    nextCursor: rows.length > limit && last ? encodeCursor({ occurred_at: last.occurredAt, id: last.id }) : null
  };
}
