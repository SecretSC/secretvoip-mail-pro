import { Router } from "express";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";
import { config } from "../config.js";
import { finalizeCampaign } from "./email.js";

const router = Router();
router.use(requireAuth);

// ============================================================
// List campaigns (with progress fields)
// ============================================================
router.get("/", async (req, res) => {
  const user = req.user!;
  const all = req.query.all === "1" && user.role === "admin";
  const limit = Math.min(parseInt(String(req.query.limit || "100")) || 100, 500);
  const params: any[] = [limit];
  let where = "";
  if (!all) {
    params.push(user.id);
    where = `WHERE c.user_id = $${params.length}`;
  }
  const isAdmin = user.role === "admin";
  const adminCols = isAdmin
    ? `, COALESCE(c.provider_cost,0)::float AS "providerCost",
         COALESCE(c.profit,0)::float AS profit,
         COALESCE(c.provider_cost_per_email,0)::float AS "providerCostPerEmail",
         c.provider_job_id AS "providerJobId"`
    : "";
  const { rows } = await query(
    `SELECT c.id, c.from_name AS "fromName", c.subject,
            c.total, c.accepted, c.failed,
            c.queued_count AS "queuedCount",
            c.processing_count AS "processingCount",
            c.delivered_count AS "deliveredCount",
            c.bounced_count AS "bouncedCount",
            c.delayed_count AS "delayedCount",
            c.invalid_count AS "invalidCount",
            c.cost::float AS cost, c.status, c.created_at AS "createdAt",
            c.last_synced_at AS "lastSyncedAt",
            c.finalized,
            COALESCE(c.price_per_email, 0)::float AS "pricePerEmail"
            ${adminCols},
            COALESCE(u.username, u.email) AS "userEmail",
            u.full_name AS "userName"
       FROM email_campaigns c
       JOIN users u ON u.id = c.user_id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $1`,
    params,
  );
  res.json(rows);
});

// ============================================================
// Active campaign (for current user) — used by Send page guard
// ============================================================
router.get("/active", async (req, res) => {
  const { rows } = await query(
    `SELECT id, subject, status, total,
            queued_count AS "queuedCount",
            processing_count AS "processingCount",
            delivered_count AS "deliveredCount",
            bounced_count AS "bouncedCount",
            created_at AS "createdAt"
       FROM email_campaigns
      WHERE user_id=$1 AND status IN ('queued','processing','sending')
      ORDER BY created_at DESC LIMIT 1`,
    [req.user!.id],
  );
  res.json(rows[0] || null);
});

// ============================================================
// Detail
// ============================================================
router.get("/:id", async (req, res) => {
  const user = req.user!;
  const isAdmin = user.role === "admin";
  const adminCols = isAdmin
    ? `, COALESCE(c.provider_cost,0)::float AS "providerCost",
         COALESCE(c.profit,0)::float AS profit,
         COALESCE(c.provider_cost_per_email,0)::float AS "providerCostPerEmail",
         c.provider_response AS "providerResponse",
         c.provider_job_id AS "providerJobId"`
    : "";
  const { rows: camp } = await query(
    `SELECT c.id, c.user_id AS "userId", c.from_name AS "fromName", c.subject,
            c.html, c.total, c.accepted, c.failed,
            c.queued_count AS "queuedCount",
            c.processing_count AS "processingCount",
            c.delivered_count AS "deliveredCount",
            c.bounced_count AS "bouncedCount",
            c.delayed_count AS "delayedCount",
            c.invalid_count AS "invalidCount",
            c.cost::float AS cost,
            COALESCE(c.price_per_email,0)::float AS "pricePerEmail",
            c.status, c.error, c.created_at AS "createdAt",
            c.last_synced_at AS "lastSyncedAt", c.finalized
            ${adminCols},
            COALESCE(u.username, u.email) AS "userEmail",
            u.full_name AS "userName"
       FROM email_campaigns c
       JOIN users u ON u.id = c.user_id
      WHERE c.id = $1`,
    [req.params.id],
  );
  if (camp.length === 0) return res.status(404).json({ error: "Not found" });
  if (!isAdmin && camp[0].userId !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { rows: recipients } = await query(
    `SELECT email, accepted, status, error, last_event_at AS "lastEventAt",
            created_at AS "createdAt"
       FROM email_results WHERE campaign_id = $1
      ORDER BY (status = 'delivered') DESC, email ASC`,
    [req.params.id],
  );
  res.json({ campaign: camp[0], recipients });
});

// ============================================================
// Sync — pull latest status from provider, finalize when done
// ============================================================
router.post("/:id/sync", async (req, res) => {
  const user = req.user!;
  const { rows: camp } = await query(
    `SELECT id, user_id AS "userId", provider_job_id AS "providerJobId",
            status, finalized, total
       FROM email_campaigns WHERE id=$1`,
    [req.params.id],
  );
  if (camp.length === 0) return res.status(404).json({ error: "Not found" });
  if (user.role !== "admin" && camp[0].userId !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (camp[0].finalized) return res.json({ ok: true, finalized: true });
  if (!camp[0].providerJobId) return res.json({ ok: false, message: "No provider job id" });

  // Poll provider
  let job: any = null;
  let httpStatus = 0;
  try {
    const resp = await fetch(
      `${config.mailProviderBaseUrl}/api/public/job/${encodeURIComponent(camp[0].providerJobId)}`,
      { headers: { Authorization: `Bearer ${config.mailProviderApiKey}` } },
    );
    httpStatus = resp.status;
    const txt = await resp.text();
    job = txt ? JSON.parse(txt) : {};
    if (!resp.ok) throw new Error(`Provider responded ${resp.status}`);
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message || err) });
  }

  // Normalize counters from the provider response.
  const sent = Number(job.sent ?? job.delivered ?? 0) || 0;
  const failed = Number(job.failed ?? 0) || 0;
  const bounced = Number(job.bounced ?? 0) || 0;
  const invalid = Number(job.invalid ?? 0) || 0;
  const delayed = Number(job.delayed ?? 0) || 0;
  const queued = Number(job.queued ?? Math.max(0, (camp[0].total ?? 0) - sent - failed - bounced - invalid - delayed)) || 0;
  const processing = Number(job.processing ?? job.sending ?? 0) || 0;
  const providerStatus = String(job.status || "").toLowerCase();

  const recipientResults: any[] = Array.isArray(job.recipients) ? job.recipients
                                : Array.isArray(job.results)    ? job.results
                                : [];

  // Patch per-recipient rows if provider returned recipient-level events
  for (const r of recipientResults) {
    const status = String(r.status || r.event || (r.ok ? "delivered" : "failed")).toLowerCase();
    await query(
      `UPDATE email_results
          SET status=$3,
              accepted = (status IN ('delivered','sent','completed')),
              error=$4,
              provider_recipient_id=COALESCE($5, provider_recipient_id),
              event_type=COALESCE($6, event_type),
              last_event_at=now()
        WHERE campaign_id=$1 AND email=$2`,
      [req.params.id, r.email, status, r.error || r.reason || null,
       r.id || r.recipientId || null, r.event || null],
    );
  }

  const terminal = ["completed", "done", "finished", "complete"].includes(providerStatus)
                || (queued === 0 && processing === 0
                    && (sent + failed + bounced + invalid + delayed) >= (camp[0].total || 0));

  if (terminal) {
    // Build a finalized result set from email_results (authoritative)
    const { rows: rResults } = await query<{ email: string; status: string; error: string | null }>(
      `SELECT email, status, error FROM email_results WHERE campaign_id=$1`,
      [req.params.id],
    );
    // If provider didn't send per-recipient breakdown, infer from counts
    if (recipientResults.length === 0) {
      // Mark first `sent` as delivered, rest failed/bounced/etc proportionally
      let i = 0;
      const allRows = rResults.slice();
      const assign = async (n: number, st: string) => {
        for (let k = 0; k < n && i < allRows.length; k++, i++) {
          if (allRows[i].status === "queued" || allRows[i].status === "processing") {
            await query(
              `UPDATE email_results SET status=$2, accepted=$3, last_event_at=now()
                WHERE campaign_id=$1 AND email=$4`,
              [req.params.id, st, st === "delivered", allRows[i].email],
            );
          }
        }
      };
      await assign(sent, "delivered");
      await assign(failed, "failed");
      await assign(bounced, "bounced");
      await assign(invalid, "invalid");
      await assign(delayed, "delayed");
    }
    const { rows: finalRows } = await query<{ email: string; status: string; error: string | null; accepted: boolean }>(
      `SELECT email, status, error, accepted FROM email_results WHERE campaign_id=$1`,
      [req.params.id],
    );
    await finalizeCampaign(
      req.params.id,
      camp[0].userId,
      finalRows.map((r) => ({ email: r.email, ok: r.accepted, error: r.error, status: r.status })),
      { jobId: camp[0].providerJobId, providerStatus, sent, failed, bounced, invalid, delayed, httpStatus },
    );
    return res.json({ ok: true, finalized: true, status: "completed" });
  }

  // Still in flight — just update counts
  const mappedStatus = ["processing", "sending"].includes(providerStatus) ? providerStatus
                     : (queued > 0 && (sent + failed) === 0 ? "queued" : "processing");

  await query(
    `UPDATE email_campaigns
        SET status=$2,
            queued_count=$3, processing_count=$4,
            delivered_count=$5, bounced_count=$6, invalid_count=$7, delayed_count=$8,
            accepted=$5, failed=$9,
            last_synced_at=now(),
            provider_response=$10
      WHERE id=$1`,
    [req.params.id, mappedStatus, queued, processing,
     sent, bounced, invalid, delayed,
     (failed + bounced + invalid),
     JSON.stringify({ jobId: camp[0].providerJobId, providerStatus, sent, failed, bounced, invalid, delayed, queued, processing, httpStatus })],
  );

  res.json({
    ok: true, finalized: false, status: mappedStatus,
    counts: { queued, processing, delivered: sent, failed, bounced, invalid, delayed },
    live: {
      status: providerStatus || mappedStatus,
      total: Number(job.total ?? camp[0].total ?? 0),
      sent, failed,
      pending: Number(job.pending ?? (queued + processing)),
      progressPct: Number(job.progressPct ?? job.progress_pct ?? 0),
      ratePerSec: Number(job.ratePerSec ?? job.rate_per_sec ?? 0),
      etaSeconds: Number(job.etaSeconds ?? job.eta_seconds ?? 0),
      elapsedSec: Number(job.elapsedSec ?? job.elapsed_sec ?? 0),
      bounceCounts: job.bounceCounts ?? job.bounce_counts ?? null,
    },
  });
});

// ============================================================
// Cancel a running campaign (proxies provider cancel)
// ============================================================
router.post("/:id/cancel", async (req, res) => {
  const user = req.user!;
  const { rows: camp } = await query<{ userId: string; providerJobId: string | null; finalized: boolean; status: string }>(
    `SELECT user_id AS "userId", provider_job_id AS "providerJobId",
            finalized, status
       FROM email_campaigns WHERE id=$1`,
    [req.params.id],
  );
  if (camp.length === 0) return res.status(404).json({ error: "Not found" });
  if (user.role !== "admin" && camp[0].userId !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (camp[0].finalized) return res.json({ ok: true, status: camp[0].status, alreadyFinal: true });
  if (!camp[0].providerJobId) return res.status(400).json({ error: "No provider job id" });

  try {
    const resp = await fetch(
      `${config.mailProviderBaseUrl}/api/public/job/${encodeURIComponent(camp[0].providerJobId)}/cancel`,
      { method: "POST", headers: { Authorization: `Bearer ${config.mailProviderApiKey}` } },
    );
    const txt = await resp.text();
    const body = txt ? (() => { try { return JSON.parse(txt); } catch { return {}; } })() : {};
    if (!resp.ok) return res.status(502).json({ error: body?.error || `Provider responded ${resp.status}` });

    await query(
      `UPDATE email_campaigns
          SET status='cancelled', finalized=true, finalized_at=now(), last_synced_at=now()
        WHERE id=$1`,
      [req.params.id],
    );
    await query(
      `UPDATE email_results SET status='cancelled', last_event_at=now()
        WHERE campaign_id=$1 AND status IN ('queued','processing','sending')`,
      [req.params.id],
    );
    await query(
      `INSERT INTO activity_logs (user_id, action, metadata) VALUES ($1, 'campaign_cancel', $2)`,
      [user.id, JSON.stringify({ campaignId: req.params.id, jobId: camp[0].providerJobId })],
    );
    return res.json({
      ok: true, status: "cancelled",
      sent: Number(body.sent ?? 0),
      failed: Number(body.failed ?? 0),
      total: Number(body.total ?? 0),
    });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message || err) });
  }
});

// ============================================================
// CSV export (campaign recipients)
// ============================================================
router.get("/:id/export.csv", async (req, res) => {
  const user = req.user!;
  const { rows: camp } = await query(
    `SELECT user_id AS "userId" FROM email_campaigns WHERE id = $1`,
    [req.params.id],
  );
  if (camp.length === 0) return res.status(404).send("Not found");
  if (user.role !== "admin" && camp[0].userId !== user.id) return res.status(403).send("Forbidden");
  const { rows } = await query<{ email: string; status: string; error: string | null; lastEventAt: string | null }>(
    `SELECT email, status, error, last_event_at AS "lastEventAt"
       FROM email_results WHERE campaign_id = $1 ORDER BY email`,
    [req.params.id],
  );
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["email,status,error,timestamp"];
  for (const r of rows) lines.push([esc(r.email), esc(r.status), esc(r.error), esc(r.lastEventAt)].join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="campaign-${req.params.id}.csv"`);
  res.send(lines.join("\n"));
});

// ============================================================
// Transmission log (per customer OR admin-all)
// ============================================================
router.get("/log/transmission", async (req, res) => {
  const user = req.user!;
  const limit = Math.min(parseInt(String(req.query.limit || "500")) || 500, 5000);
  const userIdFilter = req.query.userId ? String(req.query.userId) : null;
  const params: any[] = [limit];
  let where = "";
  if (user.role !== "admin") {
    params.push(user.id);
    where = `WHERE c.user_id = $${params.length}`;
  } else if (userIdFilter) {
    params.push(userIdFilter);
    where = `WHERE c.user_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT r.email, r.status, r.error AS reason, r.event_type AS "eventType",
            r.last_event_at AS "lastEventAt", r.created_at AS "createdAt",
            c.id AS "campaignId", c.subject, c.from_name AS "fromName",
            COALESCE(u.username, u.email) AS "userEmail"
       FROM email_results r
       JOIN email_campaigns c ON c.id = r.campaign_id
       JOIN users u ON u.id = c.user_id
       ${where}
       ORDER BY COALESCE(r.last_event_at, r.created_at) DESC
       LIMIT $1`,
    params,
  );
  res.json(rows);
});

router.get("/log/transmission.csv", async (req, res) => {
  const user = req.user!;
  const userIdFilter = req.query.userId ? String(req.query.userId) : null;
  const params: any[] = [];
  let where = "";
  if (user.role !== "admin") {
    params.push(user.id);
    where = `WHERE c.user_id = $${params.length}`;
  } else if (userIdFilter) {
    params.push(userIdFilter);
    where = `WHERE c.user_id = $${params.length}`;
  }
  const { rows } = await query<any>(
    `SELECT r.email, r.status, r.error AS reason, r.event_type AS "eventType",
            r.last_event_at AS "lastEventAt", c.subject, c.from_name AS "fromName",
            COALESCE(u.username, u.email) AS "userEmail"
       FROM email_results r
       JOIN email_campaigns c ON c.id = r.campaign_id
       JOIN users u ON u.id = c.user_id
       ${where}
       ORDER BY COALESCE(r.last_event_at, r.created_at) DESC LIMIT 50000`,
    params,
  );
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["timestamp,email,customer,campaign,from,status,event,reason"];
  for (const r of rows) lines.push([
    esc(r.lastEventAt), esc(r.email), esc(r.userEmail), esc(r.subject),
    esc(r.fromName), esc(r.status), esc(r.eventType), esc(r.reason),
  ].join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="transmission-log.csv"`);
  res.send(lines.join("\n"));
});

export default router;
