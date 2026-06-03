import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { signToken, verifyPassword } from "../auth.js";

const router = Router();

// Customers log in with USERNAME. Admin may still use email (legacy).
// Accept both via a single `identifier` (or `email` for backward compat).
const LoginSchema = z.object({
  identifier: z.string().min(1).max(255).optional(),
  email: z.string().min(1).max(255).optional(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).max(255),
});

router.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }
  const raw =
    parsed.data.identifier ?? parsed.data.username ?? parsed.data.email ?? "";
  const ident = raw.trim();
  const password = parsed.data.password;
  if (!ident || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  // Try username first (most customers), then email (admin legacy).
  const { rows } = await query<{
    id: string;
    email: string | null;
    username: string | null;
    fullName: string;
    role: "admin" | "customer";
    status: "active" | "suspended";
    balance: number;
    passwordHash: string;
  }>(
    `SELECT id, email, username, full_name AS "fullName", role, status,
            balance::float AS balance, password_hash AS "passwordHash"
       FROM users
      WHERE lower(username) = lower($1) OR lower(email) = lower($1)
      LIMIT 1`,
    [ident],
  );
  const user = rows[0];
  if (!user) {
    console.warn(`[auth] login failed: no user for "${ident}" from ${req.ip}`);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    console.warn(`[auth] login failed: bad password for ${user.username ?? user.email} from ${req.ip}`);
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.status === "suspended") {
    return res.status(403).json({ error: "Account suspended — contact your administrator." });
  }

  await query(
    `INSERT INTO activity_logs (user_id, action, metadata)
     VALUES ($1, 'login', $2)`,
    [user.id, JSON.stringify({ ip: req.ip })],
  );

  const token = signToken(user.id);
  const { passwordHash: _ph, ...safe } = user;
  console.log(`[auth] login ok: ${user.username ?? user.email} (${user.role})`);
  res.json({ token, user: safe });
});

export default router;
