import { Router } from "express";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

// List
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
  // Customers never see provider_cost / profit
  const adminCols = isAdmin
    ? `, COALESCE(c.provider_cost,0)::float AS "providerCost",
         COALESCE(c.profit,0)::float AS profit,
         COALESCE(c.provider_cost_per_email,0)::float AS "providerCostPerEmail"`
    : "";
  const { rows } = await query(
    `SELECT c.id, c.from_name AS "fromName", c.subject,
            c.total, c.accepted, c.failed,
            c.cost::float AS cost, c.status, c.created_at AS "createdAt",
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

// Detail
router.get("/:id", async (req, res) => {
  const user = req.user!;
  const isAdmin = user.role === "admin";
  const adminCols = isAdmin
    ? `, COALESCE(c.provider_cost,0)::float AS "providerCost",
         COALESCE(c.profit,0)::float AS profit,
         COALESCE(c.provider_cost_per_email,0)::float AS "providerCostPerEmail",
         c.provider_response AS "providerResponse"`
    : "";
  const { rows: camp } = await query(
    `SELECT c.id, c.user_id AS "userId", c.from_name AS "fromName", c.subject,
            c.html, c.total, c.accepted, c.failed, c.cost::float AS cost,
            COALESCE(c.price_per_email,0)::float AS "pricePerEmail",
            c.status, c.error, c.created_at AS "createdAt"
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
    `SELECT email, accepted, error, created_at AS "createdAt"
       FROM email_results WHERE campaign_id = $1
      ORDER BY accepted DESC, email ASC`,
    [req.params.id],
  );
  res.json({ campaign: camp[0], recipients });
});

// CSV export
router.get("/:id/export.csv", async (req, res) => {
  const user = req.user!;
  const { rows: camp } = await query(
    `SELECT user_id AS "userId" FROM email_campaigns WHERE id = $1`,
    [req.params.id],
  );
  if (camp.length === 0) return res.status(404).send("Not found");
  if (user.role !== "admin" && camp[0].userId !== user.id) {
    return res.status(403).send("Forbidden");
  }
  const { rows } = await query<{ email: string; accepted: boolean; error: string | null; createdAt: string; }>(
    `SELECT email, accepted, error, created_at AS "createdAt"
       FROM email_results WHERE campaign_id = $1 ORDER BY email`,
    [req.params.id],
  );
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ["email,status,error,timestamp"];
  for (const r of rows) {
    lines.push([esc(r.email), r.accepted ? "accepted" : "failed", esc(r.error || ""), esc(r.createdAt)].join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="campaign-${req.params.id}.csv"`);
  res.send(lines.join("\n"));
});

export default router;
