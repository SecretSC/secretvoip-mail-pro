-- SecretVoIP Mail — initial schema
-- Postgres 14+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  full_name       text NOT NULL,
  password_hash   text NOT NULL,
  role            text NOT NULL CHECK (role IN ('admin','customer')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  balance         numeric(14,6) NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- ============================================================
-- wallet_transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount            numeric(14,6) NOT NULL,
  previous_balance  numeric(14,6) NOT NULL,
  new_balance       numeric(14,6) NOT NULL,
  reason            text NOT NULL,
  actor_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_tx_user_idx ON wallet_transactions(user_id, created_at DESC);

-- ============================================================
-- email_campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS email_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_name   text NOT NULL,
  subject     text NOT NULL,
  html        text NOT NULL,
  total       integer NOT NULL DEFAULT 0,
  accepted    integer NOT NULL DEFAULT 0,
  failed      integer NOT NULL DEFAULT 0,
  cost        numeric(14,6) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','completed','failed')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_user_idx ON email_campaigns(user_id, created_at DESC);

-- ============================================================
-- email_results
-- ============================================================
CREATE TABLE IF NOT EXISTS email_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  email       text NOT NULL,
  accepted    boolean NOT NULL,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS results_campaign_idx ON email_results(campaign_id);

-- ============================================================
-- saved_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  subject     text NOT NULL,
  html        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS templates_user_idx ON saved_templates(user_id);

-- ============================================================
-- audit_logs (admin actions)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action          text NOT NULL,
  target_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  changes         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_admin_idx ON audit_logs(admin_id, created_at DESC);

-- ============================================================
-- error_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS error_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  campaign_id       uuid REFERENCES email_campaigns(id) ON DELETE SET NULL,
  message           text NOT NULL,
  http_status       integer,
  request_summary   jsonb,
  response_summary  jsonb,
  stack             text,
  resolved          boolean NOT NULL DEFAULT false,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS error_created_idx ON error_logs(created_at DESC);

-- ============================================================
-- activity_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_user_idx ON activity_logs(user_id, created_at DESC);

-- ============================================================
-- settings (single-row key/value)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key       text PRIMARY KEY,
  value     jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('price_per_email', '0.003'::jsonb),
  ('site_name', '"SecretVoIP Mail"'::jsonb),
  ('maintenance_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
