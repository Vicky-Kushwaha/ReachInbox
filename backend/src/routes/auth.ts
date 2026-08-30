import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { pool } from "../db/client";
import { signSession, requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

const oauthClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);

// Step 1: kick off the real Google consent screen.
router.get("/google", (req, res) => {
  const url = oauthClient.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "consent",
  });
  res.redirect(url);
});

// Step 2: Google redirects back here with a one-time `code`.
router.get("/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.redirect(`${env.FRONTEND_URL}/login?error=missing_code`);
    return;
  }

  try {
    const { tokens } = await oauthClient.getToken(code);
    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error("Google did not return an email");

    const { rows } = await pool.query(
      `INSERT INTO users (google_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET
         email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
       RETURNING id, email, name, avatar_url`,
      [payload.sub, payload.email, payload.name ?? payload.email, payload.picture ?? null]
    );
    const user = rows[0];

    // Ensure the user has at least one sender they can send from.
    await pool.query(
      `INSERT INTO senders (user_id, name, from_email)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM senders WHERE user_id = $1)`,
      [user.id, user.name, user.email]
    );

    const token = signSession(user);
    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error("[auth/google] callback failed:", err);
    res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

router.post("/logout", (req, res) => {
  res.clearCookie(env.COOKIE_NAME);
  res.json({ ok: true });
});

export default router;
