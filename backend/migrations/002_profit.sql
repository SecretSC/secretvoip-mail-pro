-- 002: profit/cost tracking + historical prices
-- Safe and idempotent.

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS price_per_email          numeric(14,6),
  ADD COLUMN IF NOT EXISTS provider_cost_per_email  numeric(14,6),
  ADD COLUMN IF NOT EXISTS provider_cost            numeric(14,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit                   numeric(14,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_response        jsonb;

-- Default provider cost setting (used to compute profit per send)
INSERT INTO settings (key, value) VALUES
  ('provider_cost_per_email', '0.001'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Backfill historical rows so old campaigns still display sensible profit.
UPDATE email_campaigns
   SET price_per_email = COALESCE(price_per_email,
                                  CASE WHEN accepted > 0 THEN cost/accepted ELSE 0.003 END),
       provider_cost_per_email = COALESCE(provider_cost_per_email, 0.001)
 WHERE price_per_email IS NULL OR provider_cost_per_email IS NULL;

UPDATE email_campaigns
   SET provider_cost = COALESCE(provider_cost_per_email,0) * accepted,
       profit        = cost - (COALESCE(provider_cost_per_email,0) * accepted)
 WHERE provider_cost = 0;
