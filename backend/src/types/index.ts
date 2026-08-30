export interface EmailAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  dataBase64: string; // raw base64 payload, no data: prefix
}

export interface EmailJobData {
  emailId: number;
  senderId: number;
  userId: number;
  fromName: string;
  fromEmail: string;
  recipient: string;
  subject: string;
  body: string;
  bodyHtml?: string | null;
  attachments?: EmailAttachment[];
  maxEmailsPerHour: number;
  minDelayMs: number;
}

export type EmailStatus = "scheduled" | "processing" | "sent" | "failed" | "rescheduled" | "cancelled";

export interface EmailRow {
  id: number;
  campaign_id: number;
  sender_id: number;
  recipient: string;
  subject: string;
  body: string;
  body_html: string | null;
  attachments: EmailAttachment[];
  scheduled_time: string;
  status: EmailStatus;
  starred: boolean;
  attempts: number;
  sent_at: string | null;
  error: string | null;
  message_id: string | null;
  enqueued: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthedUser {
  id: number;
  email: string;
  name: string;
  avatar_url: string | null;
}
