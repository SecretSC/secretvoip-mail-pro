-- 004: bulk queue, persistent progress, transmission log.
-- Safe + idempotent. No data loss. Existing rows preserved.

-- ============================================================
-- email_campaigns: relax status check, add provider/job tracking
-- ============================================================
ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_status_check;
ALTER TABLE email_campaigns
  ADD CONSTRAINT email_campaigns_status_check
  CHECK (status IN ('queued','processing','sending','completed','failed','partial','cancelled'));

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS provider_job_id   text,
  ADD COLUMN IF NOT EXISTS queued_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounced_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delayed_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invalid_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS finalized         boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS campaigns_provider_job_idx
  ON email_campaigns(provider_job_id) WHERE provider_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaigns_active_idx
  ON email_campaigns(user_id, created_at DESC)
  WHERE status IN ('queued','processing','sending');

-- Existing rows: mark finalized so they don't get re-synced
UPDATE email_campaigns SET finalized = true
  WHERE finalized = false AND status IN ('completed','failed','partial','cancelled');

-- ============================================================
-- email_results: extend with full per-recipient status
-- ============================================================
ALTER TABLE email_results
  ADD COLUMN IF NOT EXISTS status               text,
  ADD COLUMN IF NOT EXISTS provider_recipient_id text,
  ADD COLUMN IF NOT EXISTS event_type           text,
  ADD COLUMN IF NOT EXISTS last_event_at        timestamptz;

UPDATE email_results
   SET status = CASE WHEN accepted THEN 'delivered' ELSE 'failed' END
 WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS results_status_idx ON email_results(campaign_id, status);

-- ============================================================
-- Bump per-campaign recipient cap setting (advisory only)
-- ============================================================
INSERT INTO settings (key, value) VALUES
  ('max_recipients_per_campaign', '5000'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
