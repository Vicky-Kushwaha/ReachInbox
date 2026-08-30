import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db/client";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { scheduleEmailJob } from "../queues/emailQueue";
import { env } from "../config/env";
import { searchEmails } from "../services/elasticsearch";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const scheduleSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  recipients: z.array(z.string().email()).min(1).max(20000),
  startTime: z.string().datetime(),
  minDelayMs: z.number().int().positive().default(env.DEFAULT_MIN_DELAY_MS),
  maxEmailsPerHour: z.number().int().positive().default(env.DEFAULT_MAX_EMAILS_PER_HOUR),
  senderId: z.number().int().positive().optional(),
});

/** Extract & de-dupe email addresses from an uploaded CSV/TXT file's raw text. */
function extractEmails(raw: string): string[] {
  const matches = raw.match(/[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g) || [];
  return Array.from(new Set(matches.map((e) => e.trim().toLowerCase())));
}

// Parse an uploaded leads file and just report what was detected —
// the frontend then submits those addresses via POST /schedule.
router.post("/emails/parse-leads", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const text = req.file.buffer.toString("utf-8");
  const emails = extractEmails(text);
  res.json({ count: emails.length, emails });
});

router.post("/emails/schedule", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }
  const { subject, body, recipients, startTime, minDelayMs, maxEmailsPerHour, senderId } = parsed.data;
  const userId = req.user!.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let sender;
    if (senderId) {
      const r = await client.query(`SELECT * FROM senders WHERE id = $1 AND user_id = $2`, [senderId, userId]);
      sender = r.rows[0];
    } else {
      const r = await client.query(`SELECT * FROM senders WHERE user_id = $1 ORDER BY id LIMIT 1`, [userId]);
      sender = r.rows[0];
    }
    if (!sender) throw new Error("No sender available for this account");

    const campaignRes = await client.query(
      `INSERT INTO campaigns (user_id, sender_id, subject, body, start_time, min_delay_ms, max_emails_per_hour)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, sender.id, subject, body, startTime, minDelayMs, maxEmailsPerHour]
    );
    const campaignId = campaignRes.rows[0].id;

    const start = new Date(startTime).getTime();
    const created: { id: number; scheduledTime: Date; recipient: string }[] = [];

    for (let i = 0; i < recipients.length; i++) {
      // Sequential spacing preserves send order and bakes the configured
      // minimum delay in up front, before the worker's own enforcement
      // (belt-and-suspenders against clock drift / retries).
      const scheduledTime = new Date(start + i * minDelayMs);
      const insertRes = await client.query(
        `INSERT INTO emails (campaign_id, sender_id, recipient, subject, body, scheduled_time, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'scheduled') RETURNING id`,
        [campaignId, sender.id, recipients[i], subject, body, scheduledTime.toISOString()]
      );
      created.push({ id: insertRes.rows[0].id, scheduledTime, recipient: recipients[i] });
    }

    await client.query("COMMIT");

    // Enqueue BullMQ delayed jobs *after* commit so we never enqueue a job
    // for a row that failed to persist.
    for (const row of created) {
      await scheduleEmailJob(
        {
          emailId: row.id,
          senderId: sender.id,
          userId,
          fromName: sender.name,
          fromEmail: sender.from_email,
          recipient: row.recipient,
          subject,
          body,
          maxEmailsPerHour,
          minDelayMs,
        },
        row.scheduledTime
      );
      await pool.query(`UPDATE emails SET enqueued = true WHERE id = $1`, [row.id]);
    }

    res.status(201).json({ campaignId, scheduled: created.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[emails/schedule] failed:", err);
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

router.get("/emails/scheduled", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.recipient, e.subject, e.scheduled_time, e.status
     FROM emails e
     JOIN senders s ON s.id = e.sender_id
     WHERE s.user_id = $1 AND e.status IN ('scheduled', 'rescheduled', 'processing')
     ORDER BY e.scheduled_time ASC
     LIMIT 500`,
    [req.user!.id]
  );
  res.json({ emails: rows });
});

router.get("/emails/sent", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.recipient, e.subject, e.sent_at, e.status, e.message_id, e.error
     FROM emails e
     JOIN senders s ON s.id = e.sender_id
     WHERE s.user_id = $1 AND e.status IN ('sent', 'failed')
     ORDER BY e.sent_at DESC NULLS LAST
     LIMIT 500`,
    [req.user!.id]
  );
  res.json({ emails: rows });
});

router.get("/emails/search", requireAuth, async (req: AuthedRequest, res) => {
  const q = (req.query.q as string) || "";
  if (!q.trim()) {
    res.json({ results: [] });
    return;
  }
  const results = await searchEmails(q);
  res.json({ results });
});

export default router;
