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

router.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, subject, html, created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM saved_templates
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [req.user!.id],
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const p = Body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const { rows } = await query<{ id: string }>(
    `INSERT INTO saved_templates (user_id, name, subject, html)
     VALUES ($1, $2, $3, $4) RETURNING id`,
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
      WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user!.id, p.data.name, p.data.subject, p.data.html],
  );
  if (rowCount === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await query(`DELETE FROM saved_templates WHERE id=$1 AND user_id=$2`, [
    req.params.id,
    req.user!.id,
  ]);
  res.json({ ok: true });
});

export default router;
