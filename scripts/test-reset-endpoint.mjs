import Database from "better-sqlite3";
const db = new Database("/Users/zhuanzmima0000/tinkering/health-monitor/data/app.db");
const job = db.prepare("SELECT * FROM expense_receipt_jobs WHERE status = 'dead' LIMIT 1").get();
console.log("dead job found:", job);

if (job) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE expense_receipt_jobs
    SET status = 'queued', attempts = 0, error_message = NULL,
        next_attempt_at = ?, last_attempt_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(now, now, job.id);
  const after = db.prepare("SELECT id, status, attempts, error_message, next_attempt_at FROM expense_receipt_jobs WHERE id = ?").get(job.id);
  console.log("after reset:", after);
} else {
  console.log("no dead job to test with (good — none should be dead right now)");
}
