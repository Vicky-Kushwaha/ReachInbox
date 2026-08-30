import fs from "fs";
import path from "path";
import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";

let transporterPromise: Promise<Transporter> | null = null;

interface CachedAccount {
  user: string;
  pass: string;
}

/**
 * Reads a previously auto-generated Ethereal account from disk, if any.
 * This is what makes the account survive a container/process restart —
 * without it, every restart would call nodemailer.createTestAccount()
 * again and silently orphan every message sent under the old account
 * (which is exactly why old preview links start 404ing after a restart).
 */
function loadCachedAccount(): CachedAccount | null {
  try {
    const raw = fs.readFileSync(env.ETHEREAL_CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.user && parsed?.pass) return parsed;
    return null;
  } catch {
    return null; // no cache file yet, or it's unreadable — fall through to creating a new account
  }
}

function saveCachedAccount(account: CachedAccount): void {
  try {
    fs.mkdirSync(path.dirname(env.ETHEREAL_CACHE_PATH), { recursive: true });
    fs.writeFileSync(env.ETHEREAL_CACHE_PATH, JSON.stringify(account, null, 2));
  } catch (err) {
    console.warn("[mailer] could not persist the Ethereal test account to disk:", (err as Error).message);
    console.warn(`[mailer] set ETHEREAL_USER/ETHEREAL_PASS in .env to avoid a new account every restart.`);
  }
}

/**
 * Lazily creates a single shared Ethereal transporter.
 *
 * Precedence: explicit ETHEREAL_USER/PASS env vars > a cached account from a
 * previous run (see loadCachedAccount) > a brand-new nodemailer.createTestAccount().
 * Reusing the same account across restarts is what keeps previously sent
 * messages' preview links working instead of orphaning them.
 */
async function getTransporter(): Promise<Transporter> {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      let user = env.ETHEREAL_USER;
      let pass = env.ETHEREAL_PASS;

      if (!user || !pass) {
        const cached = loadCachedAccount();
        if (cached) {
          user = cached.user;
          pass = cached.pass;
          console.log(`[mailer] Reusing cached Ethereal test account: ${user}`);
        } else {
          const testAccount = await nodemailer.createTestAccount();
          user = testAccount.user;
          pass = testAccount.pass;
          saveCachedAccount({ user, pass });
          console.log("\n[mailer] No ETHEREAL_USER/PASS set — created a fresh Ethereal test account:");
          console.log(`[mailer]   user: ${user}`);
          console.log(`[mailer]   pass: ${pass}`);
          console.log(`[mailer]   Cached at ${env.ETHEREAL_CACHE_PATH} so restarts reuse it.`);
          console.log("[mailer]   For a permanent inbox, set these as ETHEREAL_USER / ETHEREAL_PASS in .env.\n");
        }
      }

      return nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user, pass },
      });
    })();
  }
  return transporterPromise;
}

export interface SendEmailInput {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  attachments?: { filename: string; contentType: string; dataBase64: string }[];
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transporter = await getTransporter();
  const attachments = input.attachments || [];
  if (attachments.length > 0) {
    console.log(`[mailer] sending to ${input.to} with ${attachments.length} attachment(s): ${attachments.map((a) => a.filename).join(", ")}`);
  }
  const info = await transporter.sendMail({
    from: `"${input.fromName}" <${input.fromEmail}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html || undefined,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.dataBase64, "base64"),
      contentType: a.contentType,
    })),
  });
  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
  };
}