import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { pool, query } from "../db.js";
import { config } from "../config.js";

const router = Router();

const EmailRe = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MAX_RECIPIENTS = 5000;

const SendSchema = z.object({
  fromName: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(500),
  html: z.string().trim().min(1).max(200_000),
  recipients: z
    .array(z.string().trim().min(3).max(255))
    .min(1)
    .max(MAX_RECIPIENTS),
});

router.post("/send", requireAuth, async (req, res) => {
  const user = req.user!;

  // Normalize older cancelled/finalized rows that may still carry an active
  // status from previous builds, then block only real non-finalized campaigns.
  await query(
    `UPDATE email_campaigns
        SET status='cancelled', last_synced_at=COALESCE(last_synced_at, now())
      WHERE user_id=$1 AND finalized=true AND status IN ('queued','processing','sending')`,
    [user.id],
  );

  // Block if user already has an active campaign
  const { rows: active } = await query<{ id: string }>(
    `SELECT id FROM email_campaigns
      WHERE user_id=$1 AND finalized=false AND status IN ('queued','processing','sending')
      LIMIT 1`,
    [user.id],
  );
  if (active.length > 0) {
    return res.status(409).json({
      error: "Your previous campaign is still processing. Please wait until it is complete.",
      activeCampaignId: active[0].id,
    });
  }

  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: `Invalid request payload (max ${MAX_RECIPIENTS} recipients)` });
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
  if (cleanRecipients.length > MAX_RECIPIENTS) {
    return res.status(400).json({ error: `Maximum ${MAX_RECIPIENTS} recipients per campaign` });
  }

  // Resolve effective pricing
  const { rows: settingRows } = await query<{ key: string; value: any }>(
    `SELECT key, value FROM settings WHERE key IN ('price_per_email','provider_cost_per_email')`,
  );
  const settingsMap = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const pricePerEmail = Number(settingsMap.price_per_email ?? config.pricePerEmail) || 0;
  const providerCostPerEmail = Number(settingsMap.provider_cost_per_email ?? 0.001) || 0;

  // Pre-flight: must cover the worst case (every recipient succeeds).
  // Hold the funds at queue-time; refund/adjust on finalize.
  const maxCost = +(cleanRecipients.length * pricePerEmail).toFixed(6);
  if (user.balance < maxCost) {
    return res.status(402).json({
      error: `Insufficient wallet balance. Needs ${maxCost.toFixed(3)} € to queue ${cleanRecipients.length} recipients (current ${user.balance.toFixed(3)} €).`,
    });
  }

  // Create campaign in 'queued' state with full snapshot
  const { rows: campRows } = await query<{ id: string }>(
    `INSERT INTO email_campaigns
        (user_id, from_name, subject, html,
         total, accepted, failed, cost, status,
         price_per_email, provider_cost_per_email,
         queued_count)
     VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 'queued', $6, $7, $5)
     RETURNING id`,
    [user.id, fromName, subject, html, cleanRecipients.length, pricePerEmail, providerCostPerEmail],
  );
  const campaignId = campRows[0].id;

  // Pre-populate per-recipient rows (status='queued') so transmission log
  // exists immediately and survives refresh.
  {
    const values: any[] = [];
    const placeholders: string[] = [];
    cleanRecipients.forEach((email, i) => {
      const b = i * 3;
      placeholders.push(`($${b + 1}, $${b + 2}, false, $${b + 3})`);
      values.push(campaignId, email, "queued");
    });
    // chunk to keep parameter count sane (3 params per row, ~5000 rows -> 15000 params; PG limit ~32767)
    const CHUNK = 1000;
    for (let i = 0; i < cleanRecipients.length; i += CHUNK) {
      const slice = cleanRecipients.slice(i, i + CHUNK);
      const vals: any[] = [];
      const ph: string[] = [];
      slice.forEach((email, j) => {
        const b = j * 3;
        ph.push(`($${b + 1}, $${b + 2}, false, $${b + 3})`);
        vals.push(campaignId, email, "queued");
      });
      await query(
        `INSERT INTO email_results (campaign_id, email, accepted, status) VALUES ${ph.join(",")}`,
        vals,
      );
    }
  }

  // Forward to upstream provider
  let upstream: any = {};
  let upstreamStatus = 0;
  try {
    const resp = await fetch(`${config.mailProviderBaseUrl}/api/public/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.mailProviderApiKey}`,
      },
      body: JSON.stringify({ fromName, subject, html, recipients: cleanRecipients }),
    });
    upstreamStatus = resp.status;
    const txt = await resp.text();
    upstream = txt ? safeJson(txt) : {};
    if (!resp.ok) throw new Error(`Upstream returned ${resp.status}: ${txt.slice(0, 200)}`);
  } catch (err: any) {
    await query(
      `UPDATE email_campaigns
          SET status='failed', error=$2, finalized=true,
              queued_count=0, failed=total
        WHERE id=$1`,
      [campaignId, String(err?.message || "Upstream error")],
    );
    await query(
      `UPDATE email_results SET status='failed', error=$2, last_event_at=now()
        WHERE campaign_id=$1`,
      [campaignId, String(err?.message || "Upstream error").slice(0, 500)],
    );
    await query(
      `INSERT INTO error_logs (user_id, campaign_id, message, http_status, request_summary)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, campaignId, String(err?.message || "Upstream error"), upstreamStatus,
       JSON.stringify({ recipients: cleanRecipients.length, fromName, subjectPreview: subject.slice(0, 80) })],
    );
    return res.status(502).json({ error: "Upstream provider error", campaignId });
  }

  // Provider may respond in TWO shapes:
  //  A) Async/bulk:  { jobId, queued, statusUrl }
  //  B) Sync:        { sent, failed, total, results: [{email, ok, error}] }
  const jobId: string | null = upstream.jobId || upstream.job_id || upstream.id || null;
  const hasResults = Array.isArray(upstream.results) && upstream.results.length > 0;

  const providerResponseSnapshot = {
    jobId, queued: upstream.queued ?? null,
    sent: upstream.sent ?? null, failed: upstream.failed ?? null,
    total: upstream.total ?? null, hasResults,
    httpStatus: upstreamStatus,
  };

  if (jobId && !hasResults) {
    // ---- ASYNC PATH: provider queued the job. Do NOT charge wallet yet.
    await query(
      `UPDATE email_campaigns
          SET status='processing', provider_job_id=$2,
              queued_count=$3, processing_count=0,
              provider_response=$4, last_synced_at=now()
        WHERE id=$1`,
      [campaignId, jobId, cleanRecipients.length, JSON.stringify(providerResponseSnapshot)],
    );
    await query(
      `INSERT INTO activity_logs (user_id, action, metadata)
       VALUES ($1, 'campaign_queued', $2)`,
      [user.id, JSON.stringify({ campaignId, jobId, total: cleanRecipients.length })],
    );
    return res.json({
      campaignId, jobId, queued: cleanRecipients.length, status: "processing",
      message: "Campaign queued. Progress will update automatically.",
    });
  }

  // ---- SYNC PATH: provider returned final per-recipient results.
  const results = (upstream.results || []).map((r: any) => ({
    email: r.email,
    ok: !!r.ok,
    error: r.error || null,
    status: r.status || (r.ok ? "delivered" : (r.error ? "failed" : "failed")),
  }));
  if (results.length === 0) {
    const sent = upstream.sent ?? 0;
    for (let i = 0; i < cleanRecipients.length; i++) {
      results.push({
        email: cleanRecipients[i],
        ok: i < sent,
        error: i < sent ? null : "no result returned",
        status: i < sent ? "delivered" : "failed",
      });
    }
  }
  await finalizeCampaign(campaignId, user.id, results, providerResponseSnapshot);

  const accepted = results.filter((r: any) => r.ok).length;
  const failed = results.length - accepted;
  const charged = +(accepted * pricePerEmail).toFixed(6);

  res.json({
    campaignId, status: "completed",
    sent: accepted, failed, total: results.length, charged, results,
  });
});

// ----------------------------------------------------------------
// Finalize: write per-recipient statuses, compute counts, charge wallet
// ----------------------------------------------------------------
export async function finalizeCampaign(
  campaignId: string,
  userId: string,
  results: { email: string; ok: boolean; error: string | null; status: string }[],
  providerResponseSnapshot: any,
) {
  const { rows: prRows } = await query<{ pricePerEmail: number; providerCostPerEmail: number }>(
    `SELECT COALESCE(price_per_email,0)::float AS "pricePerEmail",
            COALESCE(provider_cost_per_email,0)::float AS "providerCostPerEmail"
       FROM email_campaigns WHERE id=$1`,
    [campaignId],
  );
  const pricePerEmail = prRows[0]?.pricePerEmail ?? 0;
  const providerCostPerEmail = prRows[0]?.providerCostPerEmail ?? 0;

  const counts = {
    delivered: 0, failed: 0, bounced: 0, invalid: 0, delayed: 0,
  };
  for (const r of results) {
    const s = (r.status || "").toLowerCase();
    if (s === "delivered" || s === "sent" || s === "completed" || r.ok) counts.delivered++;
    else if (s === "bounced") counts.bounced++;
    else if (s === "invalid") counts.invalid++;
    else if (s === "delayed") counts.delayed++;
    else counts.failed++;
  }
  const accepted = counts.delivered;
  const failedTotal = counts.failed + counts.bounced + counts.invalid;
  const cost = +(accepted * pricePerEmail).toFixed(6);
  const providerCost = +(accepted * providerCostPerEmail).toFixed(6);
  const profit = +(cost - providerCost).toFixed(6);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert per-recipient rows (campaign already has 'queued' rows)
    for (const r of results) {
      const s = (r.status || (r.ok ? "delivered" : "failed")).toLowerCase();
      await client.query(
        `UPDATE email_results
            SET accepted=$3, status=$4, error=$5, last_event_at=now()
          WHERE campaign_id=$1 AND email=$2`,
        [campaignId, r.email, !!r.ok, s, r.error],
      );
    }

    const status = failedTotal === 0 ? "completed"
      : accepted === 0 ? "failed"
      : "partial";

    await client.query(
      `UPDATE email_campaigns
          SET accepted=$2, failed=$3, cost=$4, status=$5,
              provider_cost=$6, profit=$7, provider_response=$8,
              delivered_count=$9, bounced_count=$10, invalid_count=$11, delayed_count=$12,
              queued_count=0, processing_count=0,
              last_synced_at=now(), finalized=true
        WHERE id=$1`,
      [campaignId, accepted, failedTotal, cost, status, providerCost, profit,
       JSON.stringify(providerResponseSnapshot),
       counts.delivered, counts.bounced, counts.invalid, counts.delayed],
    );

    // Charge wallet for accepted only
    const { rows: balRows } = await client.query<{ balance: number }>(
      `SELECT balance::float AS balance FROM users WHERE id=$1 FOR UPDATE`, [userId],
    );
    const prev = balRows[0].balance;
    const next = +(prev - cost).toFixed(6);
    await client.query(`UPDATE users SET balance=$2 WHERE id=$1`, [userId, next]);

    if (cost > 0) {
      await client.query(
        `INSERT INTO wallet_transactions
           (user_id, amount, previous_balance, new_balance, reason, actor_id)
         VALUES ($1, $2, $3, $4, $5, $1)`,
        [userId, -cost, prev, next, `Campaign ${campaignId} · ${accepted} accepted`],
      );
    }

    await client.query(
      `INSERT INTO activity_logs (user_id, action, metadata)
       VALUES ($1, 'campaign_finalize', $2)`,
      [userId, JSON.stringify({ campaignId, accepted, failed: failedTotal, cost, status })],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function safeJson(s: string): any { try { return JSON.parse(s); } catch { return {}; } }

export default router;
