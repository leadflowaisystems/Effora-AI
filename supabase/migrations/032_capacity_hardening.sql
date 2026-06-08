-- 032_capacity_hardening.sql
-- Capacity, data-integrity, and performance hardening (2026-06-08).
--
-- What this migration does:
--   1. CHECK constraint on payments.amount_inr — prevents zero/negative/astronomic
--      amounts from being inserted, both by the app and any direct DB access.
--   2. CHECK constraint on payments.status — adds a named, documented constraint
--      matching the existing anonymous inline constraint from 001_initial_schema.
--   3. Index on scheduled_messages(org_id, send_at, status) — the 5-minute
--      scheduled-payment cron queries this triple.
--      NOTE: the timestamp column is send_at (defined in 018), NOT scheduled_at.
--      scheduled_at exists on payments and bookings (added in 027), not here.
--   4. Index on job_runs(started_at DESC) WHERE status='failed' — supports the
--      "recent failures" admin health dashboard query.
--   5. Trigram index on leads.name — accelerates ilike("%term%") CRM search.
--
-- All changes are safe to run on a live database:
--   - CHECK constraints via DO block with IF NOT EXISTS guard
--   - CREATE INDEX IF NOT EXISTS (no CONCURRENTLY — Supabase SQL editor runs
--     inside a transaction; CONCURRENTLY is incompatible with that)
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

-- ── 2. payments.status — named constraint matching existing allowed values ───
-- The original schema (001) has an anonymous inline CHECK for status. This adds
-- a named, documented version with the same values so it is identifiable in
-- pg_constraints. Does NOT add 'cancelled' — that value is not in the original
-- inline constraint and would always be rejected by it anyway.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_status_values'
      AND table_name       = 'payments'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_status_values
      CHECK (status IN ('pending', 'paid', 'failed', 'refunded'));
  END IF;
END $$;

-- ── 3. scheduled_messages — 5-min cron query pattern ───────────────────────
-- The timestamp column on scheduled_messages is send_at (created in 018).
-- Do NOT use scheduled_at here — that column belongs to payments and bookings
-- (added in 027), not to scheduled_messages.
-- Existing index idx_scheduled_messages_pending (from 018) only covers send_at
-- without org_id. This compound index supports per-org cron queries.
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
  ON scheduled_messages(org_id, send_at, status)
  WHERE status = 'pending';

-- ── 4. job_runs — recent failures query ─────────────────────────────────────
-- idx_job_runs_org_started and idx_job_runs_status_started already exist (031).
-- This partial index targets the admin health dashboard "last 24h failures" query.
CREATE INDEX IF NOT EXISTS idx_job_runs_failed_recent
  ON job_runs(started_at DESC)
  WHERE status = 'failed';

-- ── 5. leads name search — ilike("%term%") acceleration ─────────────────────
-- pg_trgm GIN index enables fast trigram-based substring search on leads.name.
-- Partial (WHERE deleted_at IS NULL) keeps the index small — soft-deleted leads
-- are excluded from CRM search results anyway.
-- deleted_at was added to leads in migration 012.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_leads_name_trgm
  ON leads USING gin(name gin_trgm_ops)
  WHERE deleted_at IS NULL;
