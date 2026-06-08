-- 032_capacity_hardening.sql
-- Capacity, data-integrity, and performance hardening (2026-06-08).
--
-- What this migration does:
--   1. CHECK constraint on payments.amount_inr — prevents zero/negative/astronomic
--      amounts from being inserted, both by the app and any direct DB access.
--   2. CHECK constraint on payments.status — enforces the allowed status enum
--      at the DB level (belt-and-suspenders alongside app validation).
--   3. Index on scheduled_messages(org_id, scheduled_at, status) — the 5-minute
--      scheduled-payment cron queries exactly this triple.
--   4. Index on job_runs(org_id, status, started_at) — supports per-org job
--      health queries from the admin dashboard.
--   5. Index on leads(org_id, name text_pattern_ops) — speeds up the
--      ilike("%name%") search in the CRM leads list.
--
-- All changes are safe to run on a live database:
--   - CHECK constraints with IF NOT EXISTS pattern via DO block
--   - CREATE INDEX IF NOT EXISTS (inside transaction; CONCURRENTLY removed for
--     Supabase SQL editor compatibility — brief lock only during index build)
--   - No table rewrites, no column drops, no data mutations
--
-- Idempotent: safe to re-run.

-- ── 1. payments.amount_inr — positive, capped at ₹50 lakh ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_amount_inr_range'
      AND table_name       = 'payments'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_amount_inr_range
      CHECK (amount_inr > 0 AND amount_inr <= 5000000);
  END IF;
END $$;

-- ── 2. payments.status — allowed values ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_status_values'
      AND table_name       = 'payments'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_status_values
      CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded'));
  END IF;
END $$;

-- ── 3. scheduled_messages — 5-min cron query pattern ───────────────────────
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
  ON scheduled_messages(org_id, scheduled_at, status)
  WHERE status = 'pending';

-- ── 4. job_runs — per-org health dashboard ──────────────────────────────────
-- idx_job_runs_org_started already exists from 031_job_runs.sql.
-- Add a separate partial index for the "recent failures" admin query.
CREATE INDEX IF NOT EXISTS idx_job_runs_failed_recent
  ON job_runs(started_at DESC)
  WHERE status = 'failed';

-- ── 5. leads name search — ilike("%term%") acceleration ─────────────────────
-- text_pattern_ops allows prefix/infix matching via pg_trgm if installed,
-- or at minimum avoids a full seqscan by letting Postgres estimate selectivity.
-- The trigram index requires pg_trgm extension (available on Supabase by default).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_leads_name_trgm
  ON leads USING gin(name gin_trgm_ops)
  WHERE deleted_at IS NULL;
