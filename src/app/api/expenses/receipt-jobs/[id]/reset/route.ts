import { NextRequest, NextResponse } from "next/server";

import { getExpenseReceiptJob, resetExpenseReceiptJobForRetry } from "@/lib/expenses/store";

export const runtime = "nodejs";

async function parseId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new Error("Invalid receipt job id");
  }
  return jobId;
}

// Wave 3: dead-job recovery. The standard retry endpoint refuses to run a
// dead job (server returns 409), and the UI's "立即重试" button is disabled.
// This endpoint resets a dead (or failed) job to queued with attempts=0, so
// it gets a fresh batch of MAX_JOB_ATTEMPTS under whatever config the user
// is running now. Useful after we shipped the 300s timeout + sharp
// preprocessing: jobs that died at the old 180s wall can be reactivated
// instead of deleted and re-uploaded.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const jobId = await parseId(params);
    getExpenseReceiptJob(jobId);
    const reset = resetExpenseReceiptJobForRetry(jobId);
    return NextResponse.json({ job: reset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reset failed" },
      { status: 400 }
    );
  }
}
