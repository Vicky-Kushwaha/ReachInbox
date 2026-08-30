-- ReachInbox Email Scheduler — schema
-- Safe to run multiple times (idempotent via IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  google_id     TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A "sender" is a from-address/tenant used for throttling & Ethereal SMTP sending.
CREATE TABLE IF NOT EXISTS senders (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  from_email    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per Slack workspace connection (per user/tenant).
CREATE TABLE IF NOT EXISTS slack_integrations (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id         TEXT NOT NULL,
  team_name       TEXT,
  access_token    TEXT NOT NULL,       -- bot token (xoxb-...)
  incoming_webhook_url TEXT,           -- optional, if incoming-webhook scope granted
  channel_id      TEXT,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- A "campaign" groups a compose action (subject/body/settings) for many recipients.
CREATE TABLE IF NOT EXISTS campaigns (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id             INTEGER NOT NULL REFERENCES senders(id) ON DELETE CASCADE,
  subject               TEXT NOT NULL,
  body                  TEXT NOT NULL,
  body_html             TEXT,
  attachments           JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{filename, contentType, sizeBytes, dataBase64}]
  start_time            TIMESTAMPTZ NOT NULL,
  min_delay_ms          INTEGER NOT NULL DEFAULT 2000,
  max_emails_per_hour   INTEGER NOT NULL DEFAULT 200,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per recipient email — this is what BullMQ jobs map onto 1:1 (jobId = 'email-<id>').
CREATE TABLE IF NOT EXISTS emails (
  id              SERIAL PRIMARY KEY,
  campaign_id     INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES senders(id) ON DELETE CASCADE,
  recipient       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  body_html       TEXT,
  attachments     JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_time  TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | processing | sent | failed | rescheduled | cancelled
  starred         BOOLEAN NOT NULL DEFAULT false,
  attempts        INTEGER NOT NULL DEFAULT 0,
  sent_at         TIMESTAMPTZ,
  error           TEXT,
  message_id      TEXT,          -- Ethereal message id / preview url
  enqueued        BOOLEAN NOT NULL DEFAULT false, -- has a BullMQ delayed job been created for this row
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender_id);
CREATE INDEX IF NOT EXISTS idx_emails_scheduled_time ON emails(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_emails_campaign ON emails(campaign_id);

-- Additive, idempotent upgrades for databases created before these columns existed.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS body_html TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS body_html TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false;
