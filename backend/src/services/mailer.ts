import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";

let transporterPromise: Promise<Transporter> | null = null;

/**
 * Lazily creates a single shared Ethereal transporter. If ETHEREAL_USER/PASS
 * are not provided, a fresh throwaway test account is created on first use
 * and its credentials are printed to the console (Ethereal's normal flow).
 *
 * "Multiple senders" is modeled at the application layer (the `senders`
 * table + the `From:` header), since Ethereal itself is a single fake SMTP
 * relay — this mirrors how many real providers work (one API key, many
 * verified from-addresses).
 */
async function getTransporter(): Promise<Transporter> {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      let user = env.ETHEREAL_USER;
      let pass = env.ETHEREAL_PASS;

      if (!user || !pass) {
        const testAccount = await nodemailer.createTestAccount();
        user = testAccount.user;
        pass = testAccount.pass;
        console.log("\n[mailer] No ETHEREAL_USER/PASS set — created a fresh Ethereal test account:");
        console.log(`[mailer]   user: ${user}`);
        console.log(`[mailer]   pass: ${pass}`);
        console.log("[mailer]   Save these to your .env as ETHEREAL_USER / ETHEREAL_PASS to reuse them.\n");
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
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: `"${input.fromName}" <${input.fromEmail}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
  };
}
