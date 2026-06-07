import fs from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { processExpenseReceiptJob } from "@/lib/expenses/receipt-jobs";
import { deleteExpenseReceiptJob, getExpenseReceiptJob } from "@/lib/expenses/store";

export const runtime = "nodejs";

async function parseId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new Error("Invalid receipt job id");
  }
  return jobId;
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const jobId = await parseId(params);
    // Wave 1 cleanup: refuse to re-process jobs that have hit MAX_JOB_ATTEMPTS.
    // The frontend also disables the button, but enforcing it server-side stops
    // a manual / scripted POST from bypassing the cap.
    const job = getExpenseReceiptJob(jobId);
    if (job.status === "dead") {
      return NextResponse.json(
        { error: "Job has reached max attempts. Delete and re-upload to retry." },
        { status: 409 }
      );
    }
    const result = await processExpenseReceiptJob(jobId);
    return NextResponse.json(result, { status: "receipt" in result ? 200 : 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Retry failed" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const jobId = await parseId(params);
    const job = getExpenseReceiptJob(jobId);
    const deleted = deleteExpenseReceiptJob(jobId);
    await fs.unlink(job.image_path).catch(() => undefined);
    return NextResponse.json({ job: deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed" }, { status: 400 });
  }
}
