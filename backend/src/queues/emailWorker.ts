import "../config/env"; // ensure dotenv loads first
import { DelayedError, Worker, Job } from "bullmq";
import { redisConnection, redisCounters } from "./redisConnection";
import { EMAIL_QUEUE_NAME } from "./emailQueue";
import { env } from "../config/env";
import { EmailJobData } from "../types";
import { pool } from "../db/client";
import { sendEmail } from "../services/mailer";
import { tryReserveSendSlot, nextHourWindowStart } from "../services/rateLimiter";
import { indexEmail } from "../services/elasticsearch";
import { notifyRateLimitHit } from "../services/slack";

/**
 * ---- Min delay between sends (per sender) ----
 * We don't sleep inside the processor (that would waste a concurrency slot).
 * Instead we keep a "last sent at" timestamp per sender in Redis and, if a
 * job arrives too soon after the previous send for the *same* sender, we
 * move it back into the delayed set using BullMQ's DelayedError pattern.
 * This keeps the worker's concurrency slots free for other senders' jobs
 * while still enforcing "no two emails from sender X within N ms".
 */
async function enforceMinDelay(senderId: number, minDelayMs: number, job: Job, token?: string): Promise<boolean> {
  const key = `lastsent:sender:${senderId}`;
  const lastSentRaw = await redisCounters.get(key);
  const lastSent = lastSentRaw ? parseInt(lastSentRaw, 10) : 0;
  const now = Date.now();
  const readyAt = lastSent + minDelayMs;

  if (lastSent && now < readyAt) {
    await job.moveToDelayed(readyAt, token);
    throw new DelayedError();
  }
  return true;
}

async function markLastSent(senderId: number, minDelayMs: number): Promise<void> {
  const key = `lastsent:sender:${senderId}`;
  await redisCounters.set(key, Date.now().toString(), "PX", Math.max(minDelayMs * 5, 60_000));
}

async function updateEmailRow(
  emailId: number,
  fields: Record<string, unknown>
): Promise<void> {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await pool.query(
    `UPDATE emails SET ${setClauses}, updated_at = now() WHERE id = $1`,
    [emailId, ...keys.map((k) => fields[k])]
  );
}

async function getUserIdForSender(senderId: number): Promise<number | null> {
  const { rows } = await pool.query(`SELECT user_id FROM senders WHERE id = $1`, [senderId]);
  return rows[0]?.user_id ?? null;
}

async function processEmailJob(job: Job<EmailJobData>, token?: string): Promise<void> {
  const data = job.data;

  // 1) Enforce configurable minimum delay between sends for this sender.
  await enforceMinDelay(data.senderId, data.minDelayMs, job, token);

  // 2) Enforce the hourly cap for this sender, atomically via Redis.
  const reserved = await tryReserveSendSlot(data.senderId, data.maxEmailsPerHour);
  if (!reserved) {
    const nextWindow = nextHourWindowStart();
    await updateEmailRow(data.emailId, {
      status: "rescheduled",
      scheduled_time: nextWindow.toISOString(),
    });
    // Live Slack alert — fire and forget, never blocks/crashes the worker.
    notifyRateLimitHit(data.userId, data.fromName, data.maxEmailsPerHour).catch(() => {});
    await job.moveToDelayed(nextWindow.getTime(), token);
    throw new DelayedError();
  }

  await updateEmailRow(data.emailId, { status: "processing" });
  await markLastSent(data.senderId, data.minDelayMs);

  try {
    const result = await sendEmail({
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      to: data.recipient,
      subject: data.subject,
      text: data.body,
      html: data.bodyHtml,
      attachments: data.attachments,
    });

    await updateEmailRow(data.emailId, {
      status: "sent",
      sent_at: new Date().toISOString(),
      message_id: result.previewUrl || result.messageId,
      error: null,
    });
  } catch (err) {
    await updateEmailRow(data.emailId, {
      status: "failed",
      error: (err as Error).message,
    });
    throw err; // let BullMQ retry with backoff, per defaultJobOptions
  }

  // Best-effort search indexing — never fail the job over this.
  const { rows } = await pool.query(`SELECT * FROM emails WHERE id = $1`, [data.emailId]);
  if (rows[0]) await indexEmail(rows[0]);
}

export const emailWorker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
  connection: redisConnection,
  concurrency: env.WORKER_CONCURRENCY, // configurable worker concurrency
  // Global floor so even a brand-new sender can't fire faster than this,
  // independent of the per-sender Redis-timestamp check above.
  limiter: {
    max: 1,
    duration: Math.max(50, Math.floor(env.DEFAULT_MIN_DELAY_MS / Math.max(1, env.WORKER_CONCURRENCY))),
  },
});

emailWorker.on("completed", (job) => {
  console.log(`[worker] sent email job ${job.id} (email #${job.data.emailId}) to ${job.data.recipient}`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

console.log(`[worker] listening on queue "${EMAIL_QUEUE_NAME}" with concurrency=${env.WORKER_CONCURRENCY}`);
