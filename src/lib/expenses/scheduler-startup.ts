import { startScheduler } from "@/lib/expenses/scheduler";

export function ensureExpenseSchedulerStarted(): void {
  startScheduler();
}
