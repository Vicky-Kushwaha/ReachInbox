import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db/client";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { scheduleEmailJob, emailQueue, emailJobId } from "../queues/emailQueue";
import { env } from "../config/env";
import { searchEmails } from "../services/elasticsearch";
import { EmailAttachment } from "../types";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2MB per file, generous for Ethereal's fake SMTP

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().nonnegative(),
  dataBase64: z.string().min(1),
});

const scheduleSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  bodyHtml: z.string().optional(),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).default([]),
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

function preview(text: string, len = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > len ? clean.slice(0, len) + "…" : clean;
}

// Parse an uploaded leads file and just report what was detected —
// the frontend then submits those addresses via POST /schedule.
router.post("/emails/parse-leads", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  if (req.file.size > MAX_ATTACHMENT_BYTES * 5) {
    res.status(400).json({ error: "File too large" });
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
  const { subject, body, bodyHtml, attachments, recipients, startTime, minDelayMs, maxEmailsPerHour, senderId } =
    parsed.data;
  const userId = req.user!.id;

  const totalAttachmentBytes = attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
  if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES * MAX_ATTACHMENTS) {
    res.status(400).json({ error: "Attachments are too large" });
    return;
  }

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
      `INSERT INTO campaigns (user_id, sender_id, subject, body, body_html, attachments, start_time, min_delay_ms, max_emails_per_hour)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        userId,
        sender.id,
        subject,
        body,
        bodyHtml || null,
        JSON.stringify(attachments),
        startTime,
        minDelayMs,
        maxEmailsPerHour,
      ]
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
        `INSERT INTO emails (campaign_id, sender_id, recipient, subject, body, body_html, attachments, scheduled_time, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled') RETURNING id`,
        [
          campaignId,
          sender.id,
          recipients[i],
          subject,
          body,
          bodyHtml || null,
          JSON.stringify(attachments),
          scheduledTime.toISOString(),
        ]
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
          bodyHtml: bodyHtml || null,
          attachments: attachments as EmailAttachment[],
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

// NOTE: literal routes like /emails/scheduled, /emails/sent, /emails/search
// must be declared BEFORE the /emails/:id param route below, or Express will
// match "scheduled"/"sent"/"search" as an :id value instead.

router.get("/emails/scheduled", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.recipient, e.subject, e.body, e.scheduled_time, e.status, e.starred
     FROM emails e
     JOIN senders s ON s.id = e.sender_id
     WHERE s.user_id = $1 AND e.status IN ('scheduled', 'rescheduled', 'processing')
     ORDER BY e.scheduled_time ASC
     LIMIT 500`,
    [req.user!.id]
  );
  res.json({
    emails: rows.map((r) => ({ ...r, body: undefined, preview: preview(r.body) })),
  });
});

router.get("/emails/sent", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.recipient, e.subject, e.body, e.sent_at, e.status, e.message_id, e.error, e.starred
     FROM emails e
     JOIN senders s ON s.id = e.sender_id
     WHERE s.user_id = $1 AND e.status IN ('sent', 'failed')
     ORDER BY e.sent_at DESC NULLS LAST
     LIMIT 500`,
    [req.user!.id]
  );
  res.json({
    emails: rows.map((r) => ({ ...r, body: undefined, preview: preview(r.body) })),
  });
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

router.get("/emails/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { rows } = await pool.query(
    `SELECT e.id, e.recipient, e.subject, e.body, e.body_html, e.attachments, e.scheduled_time, e.sent_at,
            e.status, e.starred, e.error, e.message_id, e.created_at,
            s.name AS sender_name, s.from_email
     FROM emails e
     JOIN senders s ON s.id = e.sender_id
     WHERE e.id = $1 AND s.user_id = $2`,
    [id, req.user!.id]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ email: rows[0] });
});

router.patch("/emails/:id/star", requireAuth, async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const starred = Boolean(req.body?.starred);
  const { rows } = await pool.query(
    `UPDATE emails e SET starred = $1
     FROM senders s
     WHERE e.id = $2 AND e.sender_id = s.id AND s.user_id = $3
     RETURNING e.id, e.starred`,
    [starred, id, req.user!.id]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ id: rows[0].id, starred: rows[0].starred });
});

// Cancels a not-yet-sent email: removes the live BullMQ job (so it can never
// fire) and marks the row `cancelled` rather than deleting it, preserving an
// audit trail. Sent/failed emails can't be "unsent", so this only applies to
// scheduled/rescheduled/processing rows.
router.delete("/emails/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { rows } = await pool.query(
    `SELECT e.id, e.status FROM emails e JOIN senders s ON s.id = e.sender_id WHERE e.id = $1 AND s.user_id = $2`,
    [id, req.user!.id]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!["scheduled", "rescheduled", "processing"].includes(rows[0].status)) {
    res.status(400).json({ error: "Only scheduled emails can be cancelled" });
    return;
  }

  const job = await emailQueue.getJob(emailJobId(id));
  if (job) await job.remove();

  await pool.query(`UPDATE emails SET status = 'cancelled', enqueued = false WHERE id = $1`, [id]);
  res.json({ ok: true });
});

export default router;
