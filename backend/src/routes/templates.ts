import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(500),
  html: z.string().trim().min(1).max(200_000),
});

// Customer-facing list: their own templates + admin private templates assigned to them.
router.get("/", async (req, res) => {
  const uid = req.user!.id;
  const { rows } = await query(
    `SELECT t.id, t.name, t.subject, t.html,
            t.created_at AS "createdAt", t.updated_at AS "updatedAt",
            CASE WHEN t.scope = 'admin_private' THEN 'assigned' ELSE 'own' END AS source,
            (t.scope = 'admin_private') AS "readOnly"
       FROM saved_templates t
       LEFT JOIN template_assignments a
              ON a.template_id = t.id AND a.user_id = $1
      WHERE (t.scope = 'user' AND t.user_id = $1)
         OR (t.scope = 'admin_private' AND a.user_id = $1)
      ORDER BY (t.scope = 'admin_private') DESC, t.updated_at DESC`,
    [uid],
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const p = Body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const { rows } = await query<{ id: string }>(
    `INSERT INTO saved_templates (user_id, name, subject, html, scope)
     VALUES ($1, $2, $3, $4, 'user') RETURNING id`,
    [req.user!.id, p.data.name, p.data.subject, p.data.html],
  );
  res.json({ id: rows[0].id });
});

router.put("/:id", async (req, res) => {
  const p = Body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const { rowCount } = await query(
    `UPDATE saved_templates
        SET name=$3, subject=$4, html=$5, updated_at=now()
      WHERE id=$1 AND user_id=$2 AND scope='user'`,
    [req.params.id, req.user!.id, p.data.name, p.data.subject, p.data.html],
  );
  if (rowCount === 0) return res.status(404).json({ error: "Not found (or read-only)" });
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await query(
    `DELETE FROM saved_templates WHERE id=$1 AND user_id=$2 AND scope='user'`,
    [req.params.id, req.user!.id],
  );
  res.json({ ok: true });
});

// Copy an assigned admin template into the customer's own templates so they can edit it.
router.post("/:id/copy", async (req, res) => {
  const uid = req.user!.id;
  const { rows: src } = await query<{ name: string; subject: string; html: string }>(
    `SELECT t.name, t.subject, t.html
       FROM saved_templates t
       LEFT JOIN template_assignments a
              ON a.template_id = t.id AND a.user_id = $2
      WHERE t.id = $1
        AND (t.scope = 'user' AND t.user_id = $2
             OR t.scope = 'admin_private' AND a.user_id = $2)
      LIMIT 1`,
    [req.params.id, uid],
  );
  if (src.length === 0) return res.status(404).json({ error: "Not accessible" });
  const { rows } = await query<{ id: string }>(
    `INSERT INTO saved_templates (user_id, name, subject, html, scope)
     VALUES ($1, $2, $3, $4, 'user') RETURNING id`,
    [uid, src[0].name + " (copy)", src[0].subject, src[0].html],
  );
  res.json({ id: rows[0].id });
});

export default router;
