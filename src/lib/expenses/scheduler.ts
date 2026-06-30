import fs from "node:fs/promises";
import path from "node:path";

import { RECEIPT_ORIGINALS_DIR, RECEIPT_THUMBS_DIR } from "@/lib/expenses/images";
import { fromCents } from "@/lib/expenses/money";
import { processExpenseReceiptJob } from "@/lib/expenses/receipt-jobs";
import {
  computeNextRun,
  createTransactionFromExtracted,
  deactivateRecurringExpense,
  getDueRecurringExpenses,
  listDueExpenseReceiptJobs,
  markRecurringExpenseRun,
  parseEndDateAsLocalNoon
} from "@/lib/expenses/store";
import { rawDb } from "@/lib/db";

const DEFAULT_OCR_INTERVAL_MS = 30_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Wave 3 subscription: recurring tick defaults to 1h. Daily rules would
// only need 24h granularity, but monthly rules need to fire on the right
// day even if the server was asleep at the right wall time. 1h is a
// pragmatic balance: any rule's "skew" is at most 1h, and the load is
// negligible (the query is a partial-index range scan).
const DEFAULT_RECURRING_INTERVAL_MS = 60 * 60 * 1000;
// Wave 3 worker: skip files newer than this to avoid racing an in-flight
// upload that has written the file but not yet committed the DB row.
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

declare global {
  var __expensesSchedulerStarted: boolean | undefined;
  var __expensesSchedulerHandles:
    | { ocr: NodeJS.Timeout | null; cleanup: NodeJS.Timeout | null; recurring: NodeJS.Timeout | null }
    | undefined;
}

function readIntervalMs(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function startScheduler(): void {
  if (globalThis.__expensesSchedulerStarted) return;
  globalThis.__expensesSchedulerStarted = true;

  const ocrInterval = readIntervalMs("SCHEDULER_OCR_INTERVAL_MS", DEFAULT_OCR_INTERVAL_MS);
  const cleanupInterval = readIntervalMs(
    "SCHEDULER_CLEANUP_INTERVAL_MS",
    DEFAULT_CLEANUP_INTERVAL_MS
  );
  // Wave 3 subscription: third tick — recurring rules. Default 1h.
  const recurringInterval = readIntervalMs(
    "SCHEDULER_RECURRING_INTERVAL_MS",
    DEFAULT_RECURRING_INTERVAL_MS
  );

  globalThis.__expensesSchedulerHandles = { ocr: null, cleanup: null, recurring: null };
  const handles = globalThis.__expensesSchedulerHandles;

  // Wave 3 worker: run OCR once at boot so due jobs don't wait a full interval
  // after a server restart. Cleanup is left for its first scheduled tick —
  // it's expensive and a fresh boot has nothing to clean.
  // Wave 3 subscription: same boot-once pattern for recurring — a server
  // restart at the wrong moment shouldn't delay a monthly charge by a full
  // hour. Failure is contained by the runXxxTick guard (re-entrancy lock).
  void runOcrTick();
  void runRecurringTick();
  handles.ocr = setInterval(() => {
    void runOcrTick();
  }, ocrInterval);
  handles.cleanup = setInterval(() => {
    void runCleanupTick();
  }, cleanupInterval);
  handles.recurring = setInterval(() => {
    void runRecurringTick();
  }, recurringInterval);

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[scheduler] started (OCR ${ocrInterval}ms, cleanup ${cleanupInterval}ms, recurring ${recurringInterval}ms)`
    );
  }
}

export function stopScheduler(): void {
  const handles = globalThis.__expensesSchedulerHandles;
  if (!handles) return;
  if (handles.ocr) clearInterval(handles.ocr);
  if (handles.cleanup) clearInterval(handles.cleanup);
  if (handles.recurring) clearInterval(handles.recurring);
  globalThis.__expensesSchedulerHandles = { ocr: null, cleanup: null, recurring: null };
  globalThis.__expensesSchedulerStarted = false;
}

let ocrRunning = false;
let cleanupRunning = false;
let recurringRunning = false;

async function runOcrTick(): Promise<void> {
  if (ocrRunning) return;
  ocrRunning = true;
  const tickStart = performance.now();
  try {
    const summary = await processExpenseQueue();
    if (summary.processed > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[scheduler] ocr tick processed=${summary.processed} succeeded=${summary.succeeded} failed=${summary.failed} in ${Math.round(performance.now() - tickStart)}ms`
        );
      }
    }
  } catch (error) {
    console.error("[scheduler] ocr tick crashed", error);
  } finally {
    ocrRunning = false;
  }
}

export async function processExpenseQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  // Wave 3 worker: cap to 5 per tick so a backlog can't block a single tick
  // for minutes. The next tick picks up the rest.
  const dueJobs = listDueExpenseReceiptJobs(5);
  let succeeded = 0;
  let failed = 0;
  for (const job of dueJobs) {
    try {
      // processExpenseReceiptJob has its own try/catch and returns
      // { job, error } on failure; it shouldn't throw, but guard anyway in
      // case getExpenseReceiptJob / markReceiptJobProcessing hits a DB error
      // before the inner try.
      const result = await processExpenseReceiptJob(job.id);
      if ("error" in result) failed++;
      else succeeded++;
    } catch (error) {
      failed++;
      console.error("[scheduler] processExpenseReceiptJob threw", {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { processed: dueJobs.length, succeeded, failed };
}

async function runCleanupTick(): Promise<void> {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    const summary = await cleanupOrphanReceiptFiles();
    if (summary.scanned > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[scheduler] cleanup tick scanned=${summary.scanned} orphans_removed=${summary.orphans_removed} errors=${summary.errors}`
        );
      }
    }
  } catch (error) {
    console.error("[scheduler] cleanup tick crashed", error);
  } finally {
    cleanupRunning = false;
  }
}

export async function cleanupOrphanReceiptFiles(): Promise<{
  scanned: number;
  orphans_removed: number;
  errors: number;
}> {
  // DB is source of truth. Include every live receipt image row and every
  // image path embedded in a queued job; otherwise multi-screenshot uploads
  // can lose their second image during orphan cleanup.
  const rows = rawDb
    .prepare(
      `
        SELECT image_path AS p FROM expense_receipt_jobs
        UNION
        SELECT image_path AS p FROM expense_receipt_images
        UNION
        SELECT image_path AS p FROM expense_receipts
        UNION
        SELECT thumbnail_path AS p FROM expense_receipts WHERE thumbnail_path IS NOT NULL
      `
    )
    .all() as { p: string }[];
  const referenced = new Set(rows.map((r) => r.p));
  const jobRows = rawDb
    .prepare("SELECT image_paths_json AS imagePathsJson FROM expense_receipt_jobs WHERE image_paths_json IS NOT NULL")
    .all() as { imagePathsJson: string | null }[];
  for (const row of jobRows) {
    if (!row.imagePathsJson) continue;
    try {
      const parsed = JSON.parse(row.imagePathsJson) as Array<{ path?: unknown }>;
      for (const entry of parsed) {
        if (typeof entry.path === "string") referenced.add(entry.path);
      }
    } catch {
      // Keep cleanup conservative when a legacy/corrupt job has bad JSON.
    }
  }

  let scanned = 0;
  let orphans_removed = 0;
  let errors = 0;
  const now = Date.now();

  const dirs: { dir: string; kind: "originals" | "thumbs" }[] = [
    { dir: RECEIPT_ORIGINALS_DIR, kind: "originals" },
    { dir: RECEIPT_THUMBS_DIR, kind: "thumbs" }
  ];

  for (const { dir } of dirs) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      // Wave 3 worker: dir may not exist yet (fresh install with zero
      // uploads). Skip silently — no orphans to find.
      continue;
    }
    for (const name of entries) {
      const fullPath = path.join(dir, name);
      scanned++;
      if (referenced.has(fullPath)) continue;
      try {
        const stat = await fs.stat(fullPath);
        // Wave 3 worker: mtime guard — files newer than the threshold might
        // be from an upload that hasn't committed its DB row yet. Be
        // conservative and leave them alone.
        if (now - stat.mtimeMs < ORPHAN_MIN_AGE_MS) continue;
        await fs.unlink(fullPath);
        orphans_removed++;
      } catch (error) {
        // EACCES, ENOENT (raced with another cleanup), etc. — log and move on
        // so one bad file doesn't abort the whole tick.
        errors++;
        console.warn("[scheduler] orphan delete failed", {
          path: fullPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  // Wave 3 dedup: extend orphan cleanup to receipt_hashes. A hash row is an
  // orphan if its receipt_id no longer exists in expense_receipts — happens
  // when a receipt is deleted outside the API (manual SQL, restored backup,
  // failed migration) and leaves the hash dangling. Cheap (PK lookups), and
  // a leftover row only wastes ~80 bytes of disk, but cleaning it keeps the
  // dedup table trustworthy and makes orphan count easy to reason about.
  try {
    const orphanHashes = rawDb
      .prepare(
        `
          SELECT h.hash AS hash
          FROM receipt_hashes h
          LEFT JOIN expense_receipts r ON r.id = h.receipt_id
          WHERE r.id IS NULL
        `
      )
      .all() as { hash: string }[];
    for (const row of orphanHashes) {
      rawDb.prepare("DELETE FROM receipt_hashes WHERE hash = ?").run(row.hash);
    }
  } catch (error) {
    // Wave 3 dedup: a fresh install may not have the receipt_hashes table
    // yet (CREATE TABLE runs in src/lib/db.ts, which is imported by the
    // store the scheduler touches). Surface but don't abort the file sweep.
    errors++;
    console.warn("[scheduler] orphan hash cleanup failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return { scanned, orphans_removed, errors };
}

// Wave 3 subscription: third tick — for every active rule whose
// next_run_at has passed, create a transaction and advance nextRunAt via
// computeNextRun. One bad rule (category typo, merchant empty, etc.) must
// NOT block the rest of the tick — we isolate each rule in its own
// try/catch and log the failure.
export async function runRecurringTick(): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (recurringRunning) return { processed: 0, succeeded: 0, failed: 0 };
  recurringRunning = true;
  const tickStart = performance.now();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  try {
    const due = getDueRecurringExpenses(new Date());
    processed = due.length;
    for (const rule of due) {
      try {
        await runSingleRecurringRule(rule);
        succeeded++;
      } catch (error) {
        failed++;
        console.error("[scheduler] recurring run failed", {
          id: rule.id,
          merchant: rule.merchant_name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    if (processed > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[scheduler] recurring tick processed=${processed} succeeded=${succeeded} failed=${failed} in ${Math.round(performance.now() - tickStart)}ms`
        );
      }
    }
  } catch (error) {
    console.error("[scheduler] recurring tick crashed", error);
  } finally {
    recurringRunning = false;
  }
  return { processed, succeeded, failed };
}

// Wave 3 subscription: factor out the per-rule work so the "立即跑一次"
// API endpoint can call it directly on a single rule, bypassing the tick's
// re-entrancy lock. Same logic, just synchronous on one rule.
async function runSingleRecurringRule(rule: ReturnType<typeof getDueRecurringExpenses>[number]): Promise<void> {
  const now = new Date();
  const totalAmount = fromCents(rule.amount_cents);
  // createTransactionFromExtracted expects dollar amounts (toCents converts
  // internally). receiptId=null matches the "manual expense" code path so
  // the transaction shows up under "已入账" with no linked receipt.
  createTransactionFromExtracted(
    null,
    {
      merchant_name: rule.merchant_name,
      purchased_at: now.toISOString(),
      currency: rule.currency,
      subtotal_amount: null,
      total_amount: totalAmount,
      tax_amount: 0,
      processing_fee: 0,
      delivery_fee: 0,
      delivery_discount: 0,
      discount_amount: 0,
      confidence: 1,
      model_suggested_auto_post: true,
      needs_review_reasons: [],
      recognition_note: "定期规则自动入账",
      user_note: rule.notes,
      items: [
        {
          name_raw: rule.merchant_name,
          name_zh: rule.merchant_name,
          category_zh: rule.category_zh,
          category_raw: null,
          quantity: "1",
          spec_text: null,
          food_amount_value: null,
          food_amount_unit: null,
          unit_price: totalAmount,
          discounted_unit_price: null,
          amount: totalAmount,
          confidence: 1,
          notes: "auto-created by recurring rule"
        }
      ]
    },
    { excludedFromBudget: rule.excluded_from_budget }
  );
  const nextRun = computeNextRun(
    {
      frequency: rule.frequency,
      dayOfMonth: rule.day_of_month,
      dayOfWeek: rule.day_of_week,
      monthOfYear: rule.month_of_year
    },
    now
  );
  // endDate gate: if the next computed run would overshoot endDate, kill
  // the rule instead of creating one final phantom transaction. endDate is
  // a date (no time); we compare against local-noon to match the start
  // semantics.
  if (rule.end_date) {
    const endDateTime = parseEndDateAsLocalNoon(rule.end_date);
    if (nextRun.getTime() > endDateTime.getTime()) {
      deactivateRecurringExpense(rule.id);
      return;
    }
  }
  markRecurringExpenseRun(rule.id, now.toISOString(), nextRun.toISOString());
}
