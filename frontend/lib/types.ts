export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url: string | null;
}

export type EmailStatus = "scheduled" | "processing" | "sent" | "failed" | "rescheduled";

export interface ScheduledEmail {
  id: number;
  recipient: string;
  subject: string;
  scheduled_time: string;
  status: EmailStatus;
}

export interface SentEmail {
  id: number;
  recipient: string;
  subject: string;
  sent_at: string | null;
  status: EmailStatus;
  message_id: string | null;
  error: string | null;
}

export interface ScheduleEmailPayload {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  minDelayMs: number;
  maxEmailsPerHour: number;
}
