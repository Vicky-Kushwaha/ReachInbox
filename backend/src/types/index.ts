export interface EmailJobData {
  emailId: number;
  senderId: number;
  userId: number;
  fromName: string;
  fromEmail: string;
  recipient: string;
  subject: string;
  body: string;
  maxEmailsPerHour: number;
  minDelayMs: number;
}

export type EmailStatus = "scheduled" | "processing" | "sent" | "failed" | "rescheduled";

export interface EmailRow {
  id: number;
  campaign_id: number;
  sender_id: number;
  recipient: string;
  subject: string;
  body: string;
  scheduled_time: string;
  status: EmailStatus;
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
