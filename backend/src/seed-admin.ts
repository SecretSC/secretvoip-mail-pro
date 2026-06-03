import "dotenv/config";
import { pool, query } from "./db.js";
import { hashPassword } from "./auth.js";

async function run() {
  const email = process.env.ADMIN_EMAIL || "admin@secretvoip.com";
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "change-me-immediately";
  const fullName = process.env.ADMIN_NAME || "Super Admin";

  const { rows } = await query(
    "SELECT id FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($2)",
    [email, username],
  );
  if (rows.length > 0) {
    console.log(`Admin already exists: ${username} / ${email}`);
    await pool.end();
    return;
  }

  const hash = await hashPassword(password);
  await query(
    `INSERT INTO users (username, email, full_name, password_hash, role, status, balance)
     VALUES ($1, $2, $3, $4, 'admin', 'active', 0)`,
    [username, email, fullName, hash],
  );
  console.log(`Seeded admin: username=${username} email=${email} password=${password}`);
  console.log("CHANGE THE PASSWORD IMMEDIATELY AFTER FIRST LOGIN.");
  await pool.end();
}

run().catch((err) => { console.error(err); process.exit(1); });
