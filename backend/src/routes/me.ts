import { Router } from "express";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";

const router = Router();

router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

router.get("/me/stats", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { rows } = await query<{
    sentToday: number;
    sentMonth: number;
    totalSpent: number;
    accepted: number;
    failed: number;
  }>(
    `SELECT
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN accepted ELSE 0 END), 0)::int AS "sentToday",
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN accepted ELSE 0 END), 0)::int AS "sentMonth",
      COALESCE(SUM(cost), 0)::float AS "totalSpent",
      COALESCE(SUM(accepted), 0)::int AS accepted,
      COALESCE(SUM(failed), 0)::int AS failed
    FROM email_campaigns
    WHERE user_id = $1`,
    [userId],
  );
  const r = rows[0];
  const totalSent = r.accepted + r.failed;
  const successRate = totalSent > 0 ? (r.accepted / totalSent) * 100 : 0;
  const failureRate = totalSent > 0 ? (r.failed / totalSent) * 100 : 0;
  res.json({
    balance: req.user!.balance,
    sentToday: r.sentToday,
    sentThisMonth: r.sentMonth,
    totalSpent: r.totalSpent,
    successRate,
    failureRate,
  });
});

export default router;
