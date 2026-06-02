import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, hashPassword } from "../auth.js";
import { pool, query } from "../db.js";

const router = Router();

router.use(requireAuth, requireAdmin);

// List customers
router.get("/customers", async (_req, res) => {
  const { rows } = await query(
    `SELECT id, email, full_name AS "fullName", role, status,
            balance::float AS balance, notes, created_at AS "createdAt"
       FROM users
      WHERE role = 'customer'
      ORDER BY created_at DESC`,
  );
  res.json(rows);
});

// Create customer
const CreateCustomer = z.object({
  email: z.string().email().max(255),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(255),
  balance: z.number().min(0).max(1_000_000).default(0),
  notes: z.string().max(2000).optional(),
});
router.post("/customers", async (req, res) => {
  const parsed = CreateCustomer.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { email, fullName, password, balance, notes } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (email, full_name, password_hash, role, status, balance, notes)
       VALUES ($1, $2, $3, 'customer', 'active', $4, $5)
       RETURNING id`,
      [email, fullName, passwordHash, balance, notes || null],
    );
    await query(
      `INSERT INTO audit_logs (admin_id, action, target_user_id, changes)
       VALUES ($1, 'create_customer', $2, $3)`,
      [req.user!.id, rows[0].id, JSON.stringify({ email, fullName, balance })],
    );
    res.json({ id: rows[0].id });
  } catch (err: any) {
    if (err?.code === "23505")
      return res.status(409).json({ error: "Email already exists" });
    throw err;
  }
});

// Suspend / unsuspend
router.post("/customers/:id/status", async (req, res) => {
  const status = req.body?.status;
  if (status !== "active" && status !== "suspended") {
    return res.status(400).json({ error: "Invalid status" });
  }
  await query(`UPDATE users SET status=$2 WHERE id=$1 AND role='customer'`, [
    req.params.id,
    status,
  ]);
  await query(
    `INSERT INTO audit_logs (admin_id, action, target_user_id, changes)
     VALUES ($1, 'set_status', $2, $3)`,
    [req.user!.id, req.params.id, JSON.stringify({ status })],
  );
  res.json({ ok: true });
});

// Reset password
router.post("/customers/:id/password", async (req, res) => {
  const password = String(req.body?.password || "");
  if (password.length < 8)
    return res.status(400).json({ error: "Password too short" });
  const hash = await hashPassword(password);
  await query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [
    req.params.id,
    hash,
  ]);
  await query(
    `INSERT INTO audit_logs (admin_id, action, target_user_id, changes)
     VALUES ($1, 'reset_password', $2, $3)`,
    [req.user!.id, req.params.id, JSON.stringify({})],
  );
  res.json({ ok: true });
});

// Wallet top-up / withdraw
const WalletOp = z.object({
  amount: z.number().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(1).max(500),
});
router.post("/customers/:id/wallet", async (req, res) => {
  const parsed = WalletOp.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { amount, reason } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ balance: number }>(
      `SELECT balance::float AS balance FROM users WHERE id=$1 FOR UPDATE`,
      [req.params.id],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Customer not found" });
    }
    const prev = rows[0].balance;
    const next = +(prev + amount).toFixed(6);
    if (next < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Resulting balance would be negative" });
    }
    await client.query(`UPDATE users SET balance=$2 WHERE id=$1`, [
      req.params.id,
      next,
    ]);
    await client.query(
      `INSERT INTO wallet_transactions
         (user_id, amount, previous_balance, new_balance, reason, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.params.id, amount, prev, next, reason, req.user!.id],
    );
    await client.query(
      `INSERT INTO audit_logs (admin_id, action, target_user_id, changes)
       VALUES ($1, 'wallet_change', $2, $3)`,
      [req.user!.id, req.params.id, JSON.stringify({ amount, reason })],
    );
    await client.query("COMMIT");
    res.json({ ok: true, balance: next });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// Diagnostics
router.get("/diagnostics", async (_req, res) => {
  const t0 = Date.now();
  let dbOk = false;
  try {
    await query("SELECT 1");
    dbOk = true;
  } catch {}
  res.json({
    db: dbOk,
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - t0,
  });
});

// Error log
router.get("/errors", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || "100")) || 100, 500);
  const { rows } = await query(
    `SELECT e.id, e.message, e.http_status AS "httpStatus",
            e.request_summary AS "requestSummary",
            e.response_summary AS "responseSummary",
            e.resolved, e.notes, e.created_at AS "createdAt",
            u.email AS "userEmail",
            e.campaign_id AS "campaignId"
       FROM error_logs e
       LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.created_at DESC
      LIMIT $1`,
    [limit],
  );
  res.json(rows);
});

router.post("/errors/:id/resolve", async (req, res) => {
  await query(
    `UPDATE error_logs SET resolved = true, notes = $2 WHERE id = $1`,
    [req.params.id, req.body?.notes || null],
  );
  res.json({ ok: true });
});

// Wallet history for a customer
router.get("/customers/:id/wallet", async (req, res) => {
  const { rows } = await query(
    `SELECT id, amount::float AS amount,
            previous_balance::float AS "previousBalance",
            new_balance::float AS "newBalance",
            reason, created_at AS "createdAt"
       FROM wallet_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 200`,
    [req.params.id],
  );
  res.json(rows);
});

// Recent admin audit log
router.get("/audit", async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.action, a.changes, a.created_at AS "createdAt",
            admin_u.email AS "adminEmail",
            target_u.email AS "targetEmail"
       FROM audit_logs a
       LEFT JOIN users admin_u ON admin_u.id = a.admin_id
       LEFT JOIN users target_u ON target_u.id = a.target_user_id
      ORDER BY a.created_at DESC
      LIMIT 200`,
  );
  res.json(rows);
});

// Platform overview stats
router.get("/overview", async (_req, res) => {
  const { rows: users } = await query<{ total: number; suspended: number }>(
    `SELECT COUNT(*)::int AS total,
            SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END)::int AS suspended
       FROM users WHERE role='customer'`,
  );
  const { rows: camp } = await query<{
    total: number;
    accepted: number;
    failed: number;
    revenue: number;
    today: number;
  }>(
    `SELECT COUNT(*)::int AS total,
            COALESCE(SUM(accepted),0)::int AS accepted,
            COALESCE(SUM(failed),0)::int AS failed,
            COALESCE(SUM(cost),0)::float AS revenue,
            COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now())
                              THEN accepted ELSE 0 END),0)::int AS today
       FROM email_campaigns`,
  );
  const { rows: errs } = await query<{ open: number }>(
    `SELECT COUNT(*)::int AS open FROM error_logs WHERE resolved = false`,
  );
  res.json({
    customers: users[0],
    campaigns: camp[0],
    errors: errs[0],
  });
});

export default router;
