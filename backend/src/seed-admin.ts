import "dotenv/config";
import { pool, query } from "./db.js";
import { hashPassword } from "./auth.js";

async function run() {
  const email = process.env.ADMIN_EMAIL || "admin@secretvoip.com";
  const password = process.env.ADMIN_PASSWORD || "change-me-immediately";
  const fullName = process.env.ADMIN_NAME || "Super Admin";

  const { rows } = await query("SELECT id FROM users WHERE lower(email)=lower($1)", [
    email,
  ]);
  if (rows.length > 0) {
    console.log(`Admin already exists: ${email}`);
    await pool.end();
    return;
  }

  const hash = await hashPassword(password);
  await query(
    `INSERT INTO users (email, full_name, password_hash, role, status, balance)
     VALUES ($1, $2, $3, 'admin', 'active', 0)`,
    [email, fullName, hash],
  );
  console.log(`Seeded admin: ${email} / ${password}`);
  console.log("CHANGE THE PASSWORD IMMEDIATELY AFTER FIRST LOGIN.");
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
