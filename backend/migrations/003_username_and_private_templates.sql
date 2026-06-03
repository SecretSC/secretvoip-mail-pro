-- 003: username login + private (admin-owned) templates + extra settings.
-- Safe and idempotent. Existing data preserved.

-- ============================================================
-- USERS: add username, make email optional
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- case-insensitive unique username (only when set)
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uniq
  ON users (lower(username)) WHERE username IS NOT NULL;

-- Backfill: derive username from email local-part, dedup with -2, -3, …
DO $$
DECLARE
  r RECORD;
  base text;
  candidate text;
  n int;
BEGIN
  FOR r IN SELECT id, email FROM users WHERE username IS NULL AND email IS NOT NULL LOOP
    base := lower(regexp_replace(split_part(r.email, '@', 1), '[^a-z0-9_.-]', '', 'g'));
    IF base = '' THEN base := 'user'; END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM users WHERE lower(username) = candidate) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    UPDATE users SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- ============================================================
-- SAVED_TEMPLATES: scope = user | admin_private
-- admin_private templates have user_id = NULL (owned by platform)
-- ============================================================
ALTER TABLE saved_templates
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'user'
  CHECK (scope IN ('user','admin_private'));

ALTER TABLE saved_templates ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================
-- TEMPLATE ASSIGNMENTS: admin gives access to selected customers
-- ============================================================
CREATE TABLE IF NOT EXISTS template_assignments (
  template_id uuid NOT NULL REFERENCES saved_templates(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, user_id)
);
CREATE INDEX IF NOT EXISTS template_assign_user_idx ON template_assignments(user_id);

-- ============================================================
-- SETTINGS DEFAULTS
-- ============================================================
INSERT INTO settings (key, value) VALUES
  ('support_telegram', '"@Hamfranord"'::jsonb),
  ('brand_tagline', '"Premium bulk email delivery"'::jsonb),
  ('provider_cost_per_email', '0.001'::jsonb)
ON CONFLICT (key) DO NOTHING;
