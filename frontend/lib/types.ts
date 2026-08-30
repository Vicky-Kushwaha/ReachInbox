export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface Sender {
  id: number;
  name: string;
  from_email: string;
}

export type EmailStatus = "scheduled" | "processing" | "sent" | "failed" | "rescheduled" | "cancelled";

export interface Attachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  dataBase64: string;
}

export interface EmailListItem {
  id: number;
  recipient: string;
  subject: string;
  preview: string;
  status: EmailStatus;
  starred: boolean;
  scheduled_time?: string;
  sent_at?: string | null;
  message_id?: string | null;
  error?: string | null;
}

export interface EmailDetail {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  body_html: string | null;
  attachments: Attachment[];
  scheduled_time: string;
  sent_at: string | null;
  status: EmailStatus;
  starred: boolean;
  error: string | null;
  message_id: string | null;
  created_at: string;
  sender_name: string;
  from_email: string;
}

export interface ScheduleEmailPayload {
  subject: string;
  body: string;
  bodyHtml?: string;
  attachments?: Attachment[];
  recipients: string[];
  startTime: string;
  minDelayMs: number;
  maxEmailsPerHour: number;
  senderId?: number;
}
