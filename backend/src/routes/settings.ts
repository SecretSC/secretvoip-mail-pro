import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../auth.js";
import { query } from "../db.js";

const router = Router();

// Public-ish: branding + customer-visible pricing
router.get("/public", async (_req, res) => {
  const { rows } = await query<{ key: string; value: any }>(
    `SELECT key, value FROM settings
      WHERE key IN ('site_name','brand_tagline','maintenance_mode',
                    'support_telegram','price_per_email')`,
  );
  const out: Record<string, any> = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

router.use(requireAuth, requireAdmin);

router.get("/", async (_req, res) => {
  const { rows } = await query<{ key: string; value: any }>(
    `SELECT key, value FROM settings ORDER BY key`,
  );
  const out: Record<string, any> = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

const KeySchema = z.string().min(1).max(64).regex(/^[a-z0-9_]+$/);

router.put("/:key", async (req, res) => {
  const keyParse = KeySchema.safeParse(req.params.key);
  if (!keyParse.success) return res.status(400).json({ error: "Invalid key" });
  const value = req.body?.value;
  if (typeof value === "undefined")
    return res.status(400).json({ error: "Missing value" });
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [keyParse.data, JSON.stringify(value)],
  );
  await query(
    `INSERT INTO audit_logs (admin_id, action, changes)
     VALUES ($1, 'update_setting', $2)`,
    [req.user!.id, JSON.stringify({ key: keyParse.data, value })],
  );
  res.json({ ok: true });
});

export default router;
