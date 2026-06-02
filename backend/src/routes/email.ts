import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { pool, query } from "../db.js";
import { config } from "../config.js";

const router = Router();

const EmailRe = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const SendSchema = z.object({
  fromName: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(500),
  html: z.string().trim().min(1).max(200_000),
  recipients: z
    .array(z.string().trim().min(3).max(255))
    .min(1)
    .max(500),
});

router.post("/send", requireAuth, async (req, res) => {
  const user = req.user!;

  // Validate input
  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }
  const { fromName, subject, html, recipients } = parsed.data;

  // Deduplicate + filter invalid
  const seen = new Set<string>();
  const cleanRecipients: string[] = [];
  for (const r of recipients) {
    const v = r.toLowerCase();
    if (!EmailRe.test(r) || seen.has(v)) continue;
    seen.add(v);
    cleanRecipients.push(r);
  }
  if (cleanRecipients.length === 0) {
    return res.status(400).json({ error: "No valid recipients" });
  }

  // Resolve effective pricing from settings (fallback to env defaults)
  const { rows: settingRows } = await query<{ key: string; value: any }>(
    `SELECT key, value FROM settings WHERE key IN ('price_per_email','provider_cost_per_email')`,
  );
  const settingsMap = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const pricePerEmail = Number(settingsMap.price_per_email ?? config.pricePerEmail) || 0;
  const providerCostPerEmail = Number(settingsMap.provider_cost_per_email ?? 0.001) || 0;

  // Pre-flight balance check
  if (user.balance < pricePerEmail) {
    return res.status(402).json({ error: "Insufficient wallet balance" });
  }

  // Create campaign row up front with historical price snapshot
  const { rows: campRows } = await query<{ id: string }>(
    `INSERT INTO email_campaigns
        (user_id, from_name, subject, html, total, accepted, failed, cost, status,
         price_per_email, provider_cost_per_email)
     VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 'sending', $6, $7)
     RETURNING id`,
    [user.id, fromName, subject, html, cleanRecipients.length, pricePerEmail, providerCostPerEmail],
  );
  const campaignId = campRows[0].id;

  // Forward to upstream provider — server-to-server only
  let upstream: {
    sent?: number;
    failed?: number;
    total?: number;
    results?: { email: string; ok: boolean; error?: string }[];
  } = {};
  let upstreamStatus = 0;
  try {
    const resp = await fetch(
      `${config.mailProviderBaseUrl}/api/public/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.mailProviderApiKey}`,
        },
        body: JSON.stringify({
          fromName,
          subject,
          html,
          recipients: cleanRecipients,
        }),
      },
    );
    upstreamStatus = resp.status;
    const txt = await resp.text();
    upstream = txt ? JSON.parse(txt) : {};
    if (!resp.ok) throw new Error(`Upstream returned ${resp.status}`);
  } catch (err: any) {
    await query(
      `UPDATE email_campaigns SET status='failed', error=$2 WHERE id=$1`,
      [campaignId, String(err?.message || "Upstream error")],
    );
    await query(
      `INSERT INTO error_logs (user_id, campaign_id, message, http_status, request_summary)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        campaignId,
        String(err?.message || "Upstream error"),
        upstreamStatus,
        JSON.stringify({
          recipients: cleanRecipients.length,
          fromName,
          subjectPreview: subject.slice(0, 80),
        }),
      ],
    );
    return res.status(502).json({ error: "Upstream provider error" });
  }

  // Normalize results
  const results = (upstream.results || []).map((r) => ({
    email: r.email,
    ok: !!r.ok,
    error: r.error || null,
  }));
  // Fallback if provider didn't return per-recipient results
  if (results.length === 0) {
    const sent = upstream.sent ?? 0;
    for (let i = 0; i < cleanRecipients.length; i++) {
      results.push({
        email: cleanRecipients[i],
        ok: i < sent,
        error: i < sent ? null : "no result returned",
      });
    }
  }

  const accepted = results.filter((r) => r.ok).length;
  const failed = results.length - accepted;
  const cost = +(accepted * pricePerEmail).toFixed(6);
  const providerCost = +(accepted * providerCostPerEmail).toFixed(6);
  const profit = +(cost - providerCost).toFixed(6);

  // Sanitised provider response — no API key / URL inside.
  const providerResponseSnapshot = {
    sent: upstream.sent ?? null,
    failed: upstream.failed ?? null,
    total: upstream.total ?? null,
    hasResults: Array.isArray(upstream.results),
    httpStatus: upstreamStatus,
  };

  // Persist recipient results + charge wallet in a transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Bulk insert recipient results
    if (results.length > 0) {
      const values: any[] = [];
      const placeholders: string[] = [];
      results.forEach((r, i) => {
        const base = i * 4;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`,
        );
        values.push(campaignId, r.email, r.ok, r.error);
      });
      await client.query(
        `INSERT INTO email_results (campaign_id, email, accepted, error)
         VALUES ${placeholders.join(",")}`,
        values,
      );
    }

    // Update campaign incl. profit snapshot
    await client.query(
      `UPDATE email_campaigns
         SET accepted=$2, failed=$3, cost=$4, status='completed',
             provider_cost=$5, profit=$6, provider_response=$7
       WHERE id=$1`,
      [campaignId, accepted, failed, cost, providerCost, profit, JSON.stringify(providerResponseSnapshot)],
    );

    // Charge wallet (lock row)
    const { rows: balRows } = await client.query<{ balance: number }>(
      `SELECT balance::float AS balance FROM users WHERE id=$1 FOR UPDATE`,
      [user.id],
    );
    const prev = balRows[0].balance;
    const next = +(prev - cost).toFixed(6);
    await client.query(`UPDATE users SET balance=$2 WHERE id=$1`, [
      user.id,
      next,
    ]);

    if (cost > 0) {
      await client.query(
        `INSERT INTO wallet_transactions
           (user_id, amount, previous_balance, new_balance, reason, actor_id)
         VALUES ($1, $2, $3, $4, $5, $1)`,
        [
          user.id,
          -cost,
          prev,
          next,
          `Campaign ${campaignId} · ${accepted} accepted`,
        ],
      );
    }

    await client.query(
      `INSERT INTO activity_logs (user_id, action, metadata)
       VALUES ($1, 'campaign_send', $2)`,
      [
        user.id,
        JSON.stringify({
          campaignId,
          accepted,
          failed,
          cost,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  res.json({
    campaignId,
    sent: accepted,
    failed,
    total: results.length,
    charged: cost,
    results,
  });
});

export default router;
