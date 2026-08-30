import { ScheduledEmail, ScheduleEmailPayload, SentEmail, User } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}

export function googleLoginUrl(): string {
  return `${API_URL}/auth/google`;
}

export function slackConnectUrl(): string {
  return `${API_URL}/auth/slack/connect`;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await request<{ user: User }>("/auth/me");
    return res.user;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await request("/auth/logout", { method: "POST" });
}

export async function getSlackStatus(): Promise<{ connected: boolean }> {
  return request("/auth/slack/status");
}

export async function disconnectSlack(): Promise<void> {
  await request("/auth/slack/disconnect", { method: "POST" });
}

export async function fetchScheduledEmails(): Promise<ScheduledEmail[]> {
  const res = await request<{ emails: ScheduledEmail[] }>("/api/emails/scheduled");
  return res.emails;
}

export async function fetchSentEmails(): Promise<SentEmail[]> {
  const res = await request<{ emails: SentEmail[] }>("/api/emails/sent");
  return res.emails;
}

export async function scheduleEmails(payload: ScheduleEmailPayload): Promise<{ campaignId: number; scheduled: number }> {
  return request("/api/emails/schedule", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function parseLeadsFile(file: File): Promise<{ count: number; emails: string[] }> {
  const form = new FormData();
  form.append("file", file);
  return request("/api/emails/parse-leads", { method: "POST", body: form });
}
