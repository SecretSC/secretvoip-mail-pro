import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { query } from "./db.js";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "customer";
  status: "active" | "suspended";
  balance: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization header" });
    }
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };

    const { rows } = await query<AuthUser>(
      `SELECT id, email, full_name AS "fullName", role, status,
              balance::float AS balance
         FROM users WHERE id = $1 LIMIT 1`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid token" });
    if (user.status === "suspended") {
      return res.status(403).json({ error: "Account suspended" });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
