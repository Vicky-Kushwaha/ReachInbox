import { Router } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getSlackAuthorizeUrl, exchangeSlackCode, saveSlackIntegration } from "../services/slack";
import { pool } from "../db/client";
import jwt from "jsonwebtoken";

const router = Router();

// We can't rely on cookies surviving Slack's redirect chain in every browser
// setup, so we embed the authed user's id in a short-lived signed `state`
// param instead — this is the standard OAuth CSRF-protection pattern, reused
// here to also carry identity across the redirect.
router.get("/slack/connect", requireAuth, (req: AuthedRequest, res) => {
  const state = jwt.sign({ userId: req.user!.id, nonce: crypto.randomBytes(8).toString("hex") }, env.JWT_SECRET, {
    expiresIn: "10m",
  });
  res.redirect(getSlackAuthorizeUrl(state));
});

router.get("/slack/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) {
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=missing_params`);
    return;
  }

  try {
    const { userId } = jwt.verify(state, env.JWT_SECRET) as { userId: number };
    const result = await exchangeSlackCode(code);
    if (!result.ok) throw new Error(result.error || "slack_oauth_failed");

    await saveSlackIntegration(userId, result);
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err) {
    console.error("[auth/slack] callback failed:", err);
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
  }
});

router.get("/slack/status", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT team_name, connected_at FROM slack_integrations WHERE user_id = $1`,
    [req.user!.id]
  );
  res.json({ connected: rows.length > 0, integration: rows[0] ?? null });
});

router.post("/slack/disconnect", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`DELETE FROM slack_integrations WHERE user_id = $1`, [req.user!.id]);
  res.json({ ok: true });
});

export default router;
