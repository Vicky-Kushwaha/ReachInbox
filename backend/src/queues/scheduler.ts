import { pool } from "../db/client";
import { emailQueue, emailJobId, scheduleEmailJob } from "./emailQueue";
import { EmailJobData } from "../types";

/**
 * Restart-safety net.
 *
 * BullMQ persists delayed jobs in Redis, so under normal operation a server
 * restart alone does nothing bad — the jobs are still sitting in Redis and
 * will fire at their scheduled delay. This function covers the harder case:
 * if Redis's data was ever lost/flushed independently of Postgres (e.g. a
 * fresh Redis container), we can fully rebuild the queue state from the
 * source of truth (Postgres) without any duplicate sends or double-charges.
 *
 * Idempotency: `scheduleEmailJob` always uses the deterministic jobId
 * `email-<id>`. BullMQ's `add()` treats adding a job with an existing jobId
 * as a no-op (it returns the existing job instead of creating a new one), so
 * calling this on every boot is always safe, even if Redis *did* still have
 * the jobs.
 */
export async function reconcileScheduledEmails(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT e.id, e.sender_id, e.recipient, e.subject, e.body, e.body_html, e.attachments, e.scheduled_time,
            c.max_emails_per_hour, c.min_delay_ms, c.user_id,
            s.name AS sender_name, s.from_email
     FROM emails e
     JOIN campaigns c ON c.id = e.campaign_id
     JOIN senders s ON s.id = e.sender_id
     WHERE e.status IN ('scheduled', 'rescheduled')`
  );

  let reconciled = 0;
  for (const row of rows) {
    const existing = await emailQueue.getJob(emailJobId(row.id));
    if (existing) continue; // already live in Redis — nothing to do

    const data: EmailJobData = {
      emailId: row.id,
      senderId: row.sender_id,
      userId: row.user_id,
      fromName: row.sender_name,
      fromEmail: row.from_email,
      recipient: row.recipient,
      subject: row.subject,
      body: row.body,
      bodyHtml: row.body_html,
      attachments: row.attachments || [],
      maxEmailsPerHour: row.max_emails_per_hour,
      minDelayMs: row.min_delay_ms,
    };
    await scheduleEmailJob(data, new Date(row.scheduled_time));
    await pool.query(`UPDATE emails SET enqueued = true WHERE id = $1`, [row.id]);
    reconciled++;
  }

  if (reconciled > 0) {
    console.log(`[scheduler] reconciled ${reconciled} email(s) missing from the queue after restart`);
  } else {
    console.log("[scheduler] reconciliation check complete — nothing to recover");
  }
}
