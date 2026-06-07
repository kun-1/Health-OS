import { NextResponse } from "next/server";

import { processExpenseReceiptJob } from "@/lib/expenses/receipt-jobs";
import { listDueExpenseReceiptJobs, listExpenseReceiptJobs } from "@/lib/expenses/store";

export const runtime = "nodejs";

export async function POST() {
  const dueJobs = listDueExpenseReceiptJobs(1);
  const results = [];
  for (const job of dueJobs) {
    results.push(await processExpenseReceiptJob(job.id));
  }

  return NextResponse.json({
    processed: results.length,
    results,
    jobs: listExpenseReceiptJobs(20).filter((job) => job.status !== "completed")
  });
}
