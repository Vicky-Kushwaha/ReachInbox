import { env } from "../config/env";
import { pool } from "../db/client";

export function getSlackAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: env.SLACK_SCOPES,
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

interface SlackOAuthResponse {
  ok: boolean;
  access_token?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { url: string; channel_id: string };
  error?: string;
}

export async function exchangeSlackCode(code: string): Promise<SlackOAuthResponse> {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });
  return (await res.json()) as SlackOAuthResponse;
}

export async function saveSlackIntegration(userId: number, data: SlackOAuthResponse): Promise<void> {
  await pool.query(
    `INSERT INTO slack_integrations (user_id, team_id, team_name, access_token, incoming_webhook_url, channel_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       team_id = EXCLUDED.team_id,
       team_name = EXCLUDED.team_name,
       access_token = EXCLUDED.access_token,
       incoming_webhook_url = EXCLUDED.incoming_webhook_url,
       channel_id = EXCLUDED.channel_id,
       connected_at = now()`,
    [
      userId,
      data.team?.id ?? "",
      data.team?.name ?? "",
      data.access_token ?? "",
      data.incoming_webhook?.url ?? null,
      data.incoming_webhook?.channel_id ?? null,
    ]
  );
}

interface SlackIntegrationRow {
  access_token: string;
  incoming_webhook_url: string | null;
  channel_id: string | null;
}

async function getIntegrationForUser(userId: number): Promise<SlackIntegrationRow | null> {
  const { rows } = await pool.query(
    `SELECT access_token, incoming_webhook_url, channel_id FROM slack_integrations WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

/**
 * Sends a live Slack notification the moment a sender's hourly rate limit is
 * hit. If the user hasn't connected Slack yet, this is a silent no-op (never
 * throws, never crashes the worker). If they connect later, the very next
 * rate-limit hit will notify — no redeploy needed, since we look the
 * integration up fresh from Postgres on every call.
 */
export async function notifyRateLimitHit(
  userId: number,
  senderName: string,
  maxPerHour: number
): Promise<void> {
  const integration = await getIntegrationForUser(userId);
  if (!integration) return; // not connected — silently skip

  const text = `:rotating_light: *Rate limit reached* for sender *${senderName}* (${maxPerHour}/hour). Remaining emails have been rescheduled into the next hour window.`;

  try {
    if (integration.incoming_webhook_url) {
      await fetch(integration.incoming_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } else if (integration.access_token && integration.channel_id) {
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${integration.access_token}`,
        },
        body: JSON.stringify({ channel: integration.channel_id, text }),
      });
    }
  } catch (err) {
    console.warn("[slack] notification failed:", (err as Error).message);
  }
}
