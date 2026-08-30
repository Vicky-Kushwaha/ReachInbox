import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    console.warn(`[env] Missing ${name} — set it in your .env file before going live.`);
    return "";
  }
  return v;
}

export const env = {
  PORT: parseInt(process.env.PORT || "4000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  FRONTEND_URL: required("FRONTEND_URL", "http://localhost:3000"),
  BACKEND_URL: required("BACKEND_URL", "http://localhost:4000"),
  JWT_SECRET: required("JWT_SECRET", "dev-secret-change-me"),
  COOKIE_NAME: process.env.COOKIE_NAME || "ri_session",

  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: required("REDIS_URL", "redis://localhost:6379"),

  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  ELASTICSEARCH_INDEX: process.env.ELASTICSEARCH_INDEX || "emails",

  ETHEREAL_USER: process.env.ETHEREAL_USER || "",
  ETHEREAL_PASS: process.env.ETHEREAL_PASS || "",

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/auth/google/callback",

  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID || "",
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET || "",
  SLACK_REDIRECT_URI: process.env.SLACK_REDIRECT_URI || "http://localhost:4000/auth/slack/callback",
  SLACK_SCOPES: process.env.SLACK_SCOPES || "chat:write,incoming-webhook",

  DEFAULT_MIN_DELAY_MS: parseInt(process.env.DEFAULT_MIN_DELAY_MS || "2000", 10),
  DEFAULT_MAX_EMAILS_PER_HOUR: parseInt(process.env.DEFAULT_MAX_EMAILS_PER_HOUR || "200", 10),
  WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY || "5", 10),
};
