import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { signToken, verifyPassword } from "../auth.js";

const router = Router();

const LoginSchema = z.object({
  email: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});

router.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }
  // Trim both — admins may paste with whitespace; users sometimes type a trailing space.
  const email = parsed.data.email.trim();
  const password = parsed.data.password; // do NOT trim password chars users typed intentionally
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const { rows } = await query<{
    id: string;
    email: string;
    fullName: string;
    role: "admin" | "customer";
    status: "active" | "suspended";
    balance: number;
    passwordHash: string;
  }>(
    `SELECT id, email, full_name AS "fullName", role, status,
            balance::float AS balance, password_hash AS "passwordHash"
       FROM users
      WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  const user = rows[0];
  if (!user) {
    console.warn(`[auth] login failed: no user for "${email}" from ${req.ip}`);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    console.warn(
      `[auth] login failed: bad password for ${user.email} (id=${user.id}) from ${req.ip}`,
    );
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.status === "suspended") {
    console.warn(`[auth] login blocked: suspended account ${user.email}`);
    return res.status(403).json({
      error: "Account suspended — contact your administrator.",
    });
  }

  await query(
    `INSERT INTO activity_logs (user_id, action, metadata)
     VALUES ($1, 'login', $2)`,
    [user.id, JSON.stringify({ ip: req.ip })],
  );

  const token = signToken(user.id);
  const { passwordHash: _ph, ...safe } = user;
  console.log(`[auth] login ok: ${user.email} (${user.role})`);
  res.json({ token, user: safe });
});

export default router;
