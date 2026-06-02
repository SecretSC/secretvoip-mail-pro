import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, hashPassword } from "../auth.js";
import { pool, query } from "../db.js";
import { config } from "../config.js";

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
  // Trim defensively — autocomplete / paste often inserts whitespace.
  const email = parsed.data.email.trim().toLowerCase();
  const fullName = parsed.data.fullName.trim();
  const password = parsed.data.password; // do NOT mutate; preserves exact chars admin showed customer
  const { balance, notes } = parsed.data;
  if (password.trim().length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 visible characters" });
  }
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
    console.log(`[admin] created customer ${email} (id=${rows[0].id})`);
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
  const raw = String(req.body?.password ?? "");
  // Trim leading/trailing whitespace defensively — these almost always come from paste.
  const password = raw.replace(/^\s+|\s+$/g, "");
  if (password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  const hash = await hashPassword(password);
  const { rowCount } = await query(
    `UPDATE users SET password_hash=$2 WHERE id=$1 AND role IN ('customer','admin')`,
    [req.params.id, hash],
  );
  if (rowCount === 0) return res.status(404).json({ error: "User not found" });
  await query(
    `INSERT INTO audit_logs (admin_id, action, target_user_id, changes)
     VALUES ($1, 'reset_password', $2, $3)`,
    [req.user!.id, req.params.id, JSON.stringify({})],
  );
  console.log(`[admin] reset password for user id=${req.params.id}`);
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

// Diagnostics — DB, uptime, provider config status
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
    provider: {
      configured: Boolean(config.mailProviderApiKey && config.mailProviderBaseUrl),
      // We intentionally do NOT expose the full URL or any part of the key.
      baseHost: safeHost(config.mailProviderBaseUrl),
    },
  });
});

function safeHost(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return "—";
  }
}

// Live provider connection test — admin-only
router.post("/provider/test", async (_req, res) => {
  const t0 = Date.now();
  try {
    const resp = await fetch(`${config.mailProviderBaseUrl}/api/public/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.mailProviderApiKey}`,
      },
      // Empty recipient list — provider should reply with a validation error
      // quickly, which is enough to prove auth + connectivity.
      body: JSON.stringify({
        fromName: "SecretVoIP Mail Diagnostics",
        subject: "ping",
        html: "<p>ping</p>",
        recipients: [],
      }),
    });
    const latency = Date.now() - t0;
    const text = await resp.text();
    res.json({
      ok: resp.status < 500,
      status: resp.status,
      latencyMs: latency,
      reachable: true,
      // 401 means key invalid; 400 means reached and authed but rejected payload — both prove reachability.
      authOk: resp.status !== 401 && resp.status !== 403,
      responsePreview: text.slice(0, 500),
    });
  } catch (err: any) {
    res.json({
      ok: false,
      reachable: false,
      latencyMs: Date.now() - t0,
      error: String(err?.message || err),
    });
  }
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

// Platform overview stats (now with profit)
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
    providerCost: number;
    profit: number;
    today: number;
  }>(
    `SELECT COUNT(*)::int AS total,
            COALESCE(SUM(accepted),0)::int AS accepted,
            COALESCE(SUM(failed),0)::int AS failed,
            COALESCE(SUM(cost),0)::float AS revenue,
            COALESCE(SUM(provider_cost),0)::float AS "providerCost",
            COALESCE(SUM(profit),0)::float AS profit,
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

// ============================================================
// Customer history — campaigns + wallet + activity in one go
// ============================================================
router.get("/customers/:id/history", async (req, res) => {
  const id = req.params.id;
  const { rows: profile } = await query(
    `SELECT id, email, full_name AS "fullName", role, status,
            balance::float AS balance, notes, created_at AS "createdAt"
       FROM users WHERE id=$1`,
    [id],
  );
  if (profile.length === 0) return res.status(404).json({ error: "Not found" });

  const { rows: campaigns } = await query(
    `SELECT id, from_name AS "fromName", subject, total, accepted, failed,
            cost::float AS cost,
            COALESCE(price_per_email,0)::float AS "pricePerEmail",
            COALESCE(provider_cost_per_email,0)::float AS "providerCostPerEmail",
            COALESCE(provider_cost,0)::float AS "providerCost",
            COALESCE(profit,0)::float AS profit,
            status, error, created_at AS "createdAt"
       FROM email_campaigns
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 500`,
    [id],
  );
  const { rows: wallet } = await query(
    `SELECT id, amount::float AS amount,
            previous_balance::float AS "previousBalance",
            new_balance::float AS "newBalance",
            reason, created_at AS "createdAt"
       FROM wallet_transactions
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 500`,
    [id],
  );
  const { rows: activity } = await query(
    `SELECT id, action, metadata, created_at AS "createdAt"
       FROM activity_logs WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 200`,
    [id],
  );

  const totals = campaigns.reduce(
    (acc, c: any) => {
      acc.accepted += c.accepted;
      acc.failed += c.failed;
      acc.revenue += c.cost;
      acc.providerCost += c.providerCost;
      acc.profit += c.profit;
      return acc;
    },
    { accepted: 0, failed: 0, revenue: 0, providerCost: 0, profit: 0 },
  );

  res.json({ profile: profile[0], campaigns, wallet, activity, totals });
});

// CSV exports for a customer
function toCsv(rows: any[], cols: string[]): string {
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

router.get("/customers/:id/campaigns.csv", async (req, res) => {
  const { rows } = await query(
    `SELECT created_at AS "createdAt", from_name AS "fromName", subject,
            total, accepted, failed, cost::float AS cost,
            COALESCE(provider_cost,0)::float AS "providerCost",
            COALESCE(profit,0)::float AS profit, status
       FROM email_campaigns WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.params.id],
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="customer-${req.params.id}-campaigns.csv"`);
  res.send(
    toCsv(rows, [
      "createdAt", "fromName", "subject", "total", "accepted",
      "failed", "cost", "providerCost", "profit", "status",
    ]),
  );
});

router.get("/customers/:id/wallet.csv", async (req, res) => {
  const { rows } = await query(
    `SELECT created_at AS "createdAt", amount::float AS amount,
            previous_balance::float AS "previousBalance",
            new_balance::float AS "newBalance", reason
       FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.params.id],
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="customer-${req.params.id}-wallet.csv"`);
  res.send(toCsv(rows, ["createdAt", "amount", "previousBalance", "newBalance", "reason"]));
});

export default router;
