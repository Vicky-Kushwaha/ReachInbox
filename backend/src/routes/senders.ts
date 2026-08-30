import { Router } from "express";
import { pool } from "../db/client";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/senders", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, from_email FROM senders WHERE user_id = $1 ORDER BY id ASC`,
    [req.user!.id]
  );
  res.json({ senders: rows });
});

export default router;
