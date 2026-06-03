import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, hashPassword } from "../auth.js";
import { pool, query } from "../db.js";
import { config } from "../config.js";

const router = Router();

router.use(requireAuth, requireAdmin);

const USERNAME_RE = /^[a-zA-Z0-9._-]{2,40}$/;

// ============================================================
// CUSTOMERS
// ============================================================
router.get("/customers", async (_req, res) => {
  const { rows } = await query(
    `SELECT id, username, email, full_name AS "fullName", role, status,
            balance::float AS balance, notes, created_at AS "createdAt"
       FROM users
      WHERE role = 'customer'
      ORDER BY created_at DESC`,
  );
  res.json(rows);
});

// Create customer — USERNAME based (no email required).
const CreateCustomer = z.object({
  username: z.string().trim().min(2).max(40).regex(USERNAME_RE),
  password: z.string().min(6).max(255),
  balance: z.number().min(0).max(1_000_000).default(0),
  fullName: z.string().trim().min(1).max(120).optional(),
  notes: z.string().max(2000).optional(),
});
router.post("/customers", async (req, res) => {
  const parsed = CreateCustomer.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid input — username 2–40 chars (letters, numbers, . _ -), password ≥ 6.",
    });
  }
  const username = parsed.data.username.trim();
  const password = parsed.data.password;
  const fullName = (parsed.data.fullName ?? username).trim();
  const { balance, notes } = parsed.data;
  if (password.trim().length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 visible characters" });
  }
  const passwordHash = await hashPassword(password);
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (username, full_name, password_hash, role, status, balance, notes)
       VALUES ($1, $2, $3, 'customer', 'active', $4, $5)
       RETURNING id`,
      [username, fullName, passwordHash, balance, notes || null],
    );
    await query(
      `INSERT INTO audit_logs (admin_id, action, target_user_id, changes)
       VALUES ($1, 'create_customer', $2, $3)`,
      [req.user!.id, rows[0].id, JSON.stringify({ username, balance })],
    );
    console.log(`[admin] created customer ${username} (id=${rows[0].id})`);
    res.json({ id: rows[0].id, username });
  } catch (err: any) {
    if (err?.code === "23505")
      return res.status(409).json({ error: "Username already taken" });
    throw err;
  }
});

// Edit username / fullName / notes
const EditCustomer = z.object({
  username: z.string().trim().min(2).max(40).regex(USERNAME_RE).optional(),
  fullName: z.string().trim().min(1).max(120).optional(),
  notes: z.string().max(2000).nullable().optional(),
});
router.patch("/customers/:id", async (req, res) => {
  const p = EditCustomer.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const fields: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (p.data.username !== undefined) {
    fields.push(`username = $${i++}`);
    vals.push(p.data.username);
  }
  if (p.data.fullName !== undefined) {
    fields.push(`full_name = $${i++}`);
    vals.push(p.data.fullName);
  }
  if (p.data.notes !== undefined) {
    fields.push(`notes = $${i++}`);
    vals.push(p.data.notes);
  }
  if (fields.length === 0) return res.json({ ok: true });
  vals.push(req.params.id);
  try {
    await query(
      `UPDATE users SET ${fields.join(", ")}, updated_at = now()
        WHERE id = $${i} AND role IN ('customer','admin')`,
      vals,
    );
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Username already taken" });
    throw err;
  }
  await query(
    `INSERT INTO audit_logs (admin_id, action, target_user_id, changes)
     VALUES ($1, 'edit_customer', $2, $3)`,
    [req.user!.id, req.params.id, JSON.stringify(p.data)],
  );
  res.json({ ok: true });
});

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

router.post("/customers/:id/password", async (req, res) => {
  const raw = String(req.body?.password ?? "");
  const password = raw.replace(/^\s+|\s+$/g, "");
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters" });
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
  // Echo password back ONCE so admin can copy & share. Never stored plain.
  res.json({ ok: true, password });
});

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

// ============================================================
// DIAGNOSTICS
// ============================================================
router.get("/diagnostics", async (_req, res) => {
  const t0 = Date.now();
  let dbOk = false;
  try { await query("SELECT 1"); dbOk = true; } catch {}
  res.json({
    db: dbOk,
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - t0,
    provider: {
      configured: Boolean(config.mailProviderApiKey && config.mailProviderBaseUrl),
      baseHost: safeHost(config.mailProviderBaseUrl),
    },
  });
});

function safeHost(u: string): string {
  try { return new URL(u).host; } catch { return "—"; }
}

router.post("/provider/test", async (_req, res) => {
  const t0 = Date.now();
  try {
    const resp = await fetch(`${config.mailProviderBaseUrl}/api/public/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.mailProviderApiKey}`,
      },
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
      authOk: resp.status !== 401 && resp.status !== 403,
      responsePreview: text.slice(0, 500),
    });
  } catch (err: any) {
    res.json({ ok: false, reachable: false, latencyMs: Date.now() - t0, error: String(err?.message || err) });
  }
});

// ============================================================
// ERROR LOG / AUDIT / OVERVIEW
// ============================================================
router.get("/errors", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || "100")) || 100, 500);
  const { rows } = await query(
    `SELECT e.id, e.message, e.http_status AS "httpStatus",
            e.request_summary AS "requestSummary",
            e.response_summary AS "responseSummary",
            e.resolved, e.notes, e.created_at AS "createdAt",
            COALESCE(u.username, u.email) AS "userEmail",
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
  await query(`UPDATE error_logs SET resolved = true, notes = $2 WHERE id = $1`,
    [req.params.id, req.body?.notes || null]);
  res.json({ ok: true });
});

router.get("/customers/:id/wallet", async (req, res) => {
  const { rows } = await query(
    `SELECT id, amount::float AS amount,
            previous_balance::float AS "previousBalance",
            new_balance::float AS "newBalance",
            reason, created_at AS "createdAt"
       FROM wallet_transactions WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 200`,
    [req.params.id],
  );
  res.json(rows);
});

router.get("/audit", async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.action, a.changes, a.created_at AS "createdAt",
            COALESCE(admin_u.username, admin_u.email) AS "adminEmail",
            COALESCE(target_u.username, target_u.email) AS "targetEmail"
       FROM audit_logs a
       LEFT JOIN users admin_u ON admin_u.id = a.admin_id
       LEFT JOIN users target_u ON target_u.id = a.target_user_id
      ORDER BY a.created_at DESC LIMIT 200`,
  );
  res.json(rows);
});

router.get("/overview", async (_req, res) => {
  const { rows: users } = await query<{ total: number; suspended: number }>(
    `SELECT COUNT(*)::int AS total,
            SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END)::int AS suspended
       FROM users WHERE role='customer'`,
  );
  const { rows: camp } = await query(
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
  res.json({ customers: users[0], campaigns: camp[0], errors: errs[0] });
});

// ============================================================
// CUSTOMER HISTORY
// ============================================================
router.get("/customers/:id/history", async (req, res) => {
  const id = req.params.id;
  const { rows: profile } = await query(
    `SELECT id, username, email, full_name AS "fullName", role, status,
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
      ORDER BY created_at DESC LIMIT 500`,
    [id],
  );
  const { rows: wallet } = await query(
    `SELECT id, amount::float AS amount,
            previous_balance::float AS "previousBalance",
            new_balance::float AS "newBalance",
            reason, created_at AS "createdAt"
       FROM wallet_transactions WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 500`,
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
      acc.accepted += c.accepted; acc.failed += c.failed;
      acc.revenue += c.cost; acc.providerCost += c.providerCost;
      acc.profit += c.profit; return acc;
    },
    { accepted: 0, failed: 0, revenue: 0, providerCost: 0, profit: 0 },
  );
  res.json({ profile: profile[0], campaigns, wallet, activity, totals });
});

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
  res.send(toCsv(rows, ["createdAt","fromName","subject","total","accepted","failed","cost","providerCost","profit","status"]));
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
  res.send(toCsv(rows, ["createdAt","amount","previousBalance","newBalance","reason"]));
});

// ============================================================
// PRIVATE TEMPLATES (admin-owned, assignable)
// ============================================================
const PrivTplSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(500),
  html: z.string().trim().min(1).max(200_000),
});

router.get("/templates", async (_req, res) => {
  const { rows } = await query(
    `SELECT t.id, t.name, t.subject, t.html,
            t.created_at AS "createdAt", t.updated_at AS "updatedAt",
            COALESCE(
              (SELECT json_agg(json_build_object(
                'userId', a.user_id,
                'username', u.username,
                'fullName', u.full_name
              )) FROM template_assignments a
                 JOIN users u ON u.id = a.user_id
                 WHERE a.template_id = t.id),
              '[]'::json) AS "assignees"
       FROM saved_templates t
      WHERE t.scope = 'admin_private'
      ORDER BY t.updated_at DESC`,
  );
  res.json(rows);
});

router.post("/templates", async (req, res) => {
  const p = PrivTplSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const { rows } = await query<{ id: string }>(
    `INSERT INTO saved_templates (user_id, name, subject, html, scope)
     VALUES (NULL, $1, $2, $3, 'admin_private') RETURNING id`,
    [p.data.name, p.data.subject, p.data.html],
  );
  res.json({ id: rows[0].id });
});

router.put("/templates/:id", async (req, res) => {
  const p = PrivTplSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const { rowCount } = await query(
    `UPDATE saved_templates SET name=$2, subject=$3, html=$4, updated_at=now()
      WHERE id=$1 AND scope='admin_private'`,
    [req.params.id, p.data.name, p.data.subject, p.data.html],
  );
  if (rowCount === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

router.delete("/templates/:id", async (req, res) => {
  await query(`DELETE FROM saved_templates WHERE id=$1 AND scope='admin_private'`, [req.params.id]);
  res.json({ ok: true });
});

router.post("/templates/:id/assign", async (req, res) => {
  const userIds: string[] = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
  if (userIds.length === 0) return res.status(400).json({ error: "userIds required" });
  for (const uid of userIds) {
    await query(
      `INSERT INTO template_assignments (template_id, user_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (template_id, user_id) DO NOTHING`,
      [req.params.id, uid, req.user!.id],
    );
  }
  res.json({ ok: true });
});

router.post("/templates/:id/unassign", async (req, res) => {
  const userIds: string[] = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
  if (userIds.length === 0) return res.status(400).json({ error: "userIds required" });
  await query(
    `DELETE FROM template_assignments WHERE template_id=$1 AND user_id = ANY($2::uuid[])`,
    [req.params.id, userIds],
  );
  res.json({ ok: true });
});

// ============================================================
// CUSTOMER-OWNED TEMPLATES (admin moderation)
// ============================================================
router.get("/customer-templates", async (req, res) => {
  const userId = req.query.userId ? String(req.query.userId) : null;
  const params: any[] = [];
  let where = `WHERE t.scope = 'user'`;
  if (userId) { params.push(userId); where += ` AND t.user_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT t.id, t.name, t.subject, t.html,
            t.created_at AS "createdAt", t.updated_at AS "updatedAt",
            t.user_id AS "userId",
            COALESCE(u.username, u.email) AS "userEmail",
            u.full_name AS "userName"
       FROM saved_templates t
       LEFT JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY t.updated_at DESC LIMIT 500`,
    params,
  );
  res.json(rows);
});

const EditCustomerTpl = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(500),
  html: z.string().trim().min(1).max(200_000),
});
router.put("/customer-templates/:id", async (req, res) => {
  const p = EditCustomerTpl.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const { rowCount } = await query(
    `UPDATE saved_templates SET name=$2, subject=$3, html=$4, updated_at=now()
      WHERE id=$1 AND scope='user'`,
    [req.params.id, p.data.name, p.data.subject, p.data.html],
  );
  if (rowCount === 0) return res.status(404).json({ error: "Not found" });
  await query(
    `INSERT INTO audit_logs (admin_id, action, target_user_id, changes)
     VALUES ($1, 'edit_customer_template', NULL, $2)`,
    [req.user!.id, JSON.stringify({ templateId: req.params.id, name: p.data.name })],
  );
  res.json({ ok: true });
});
router.delete("/customer-templates/:id", async (req, res) => {
  const { rowCount } = await query(
    `DELETE FROM saved_templates WHERE id=$1 AND scope='user'`,
    [req.params.id],
  );
  if (rowCount === 0) return res.status(404).json({ error: "Not found" });
  await query(
    `INSERT INTO audit_logs (admin_id, action, target_user_id, changes)
     VALUES ($1, 'delete_customer_template', NULL, $2)`,
    [req.user!.id, JSON.stringify({ templateId: req.params.id })],
  );
  res.json({ ok: true });
});

// ============================================================
// Customer transmission log (admin)
// ============================================================
router.get("/customers/:id/transmission", async (req, res) => {
  const { rows } = await query(
    `SELECT r.email, r.status, r.error AS reason, r.event_type AS "eventType",
            r.last_event_at AS "lastEventAt", r.created_at AS "createdAt",
            c.id AS "campaignId", c.subject, c.from_name AS "fromName"
       FROM email_results r
       JOIN email_campaigns c ON c.id = r.campaign_id
      WHERE c.user_id = $1
      ORDER BY COALESCE(r.last_event_at, r.created_at) DESC
      LIMIT 1000`,
    [req.params.id],
  );
  res.json(rows);
});

export default router;
