-- 033_data_safety.sql
-- Data safety, auditability, and financial record hardening (2026-06-08).
--
-- What this migration does:
--   1. Skipped — audit_log(org_id, created_at DESC) index already exists as
--      "audit_log_org_created" from migration 007. Creating a second index on
--      the same columns under a different name wastes storage and write I/O.
--   2. Partial index on payments for status='paid' revenue queries.
--      Guarded by a column-existence check because payments.deleted_at has no
--      corresponding ADD COLUMN migration (likely added manually).
--   3. Skipped — lead_events(lead_id, created_at DESC) index already exists as
--      "lead_events_lead_created" from migration 026. Same duplication concern.
--   4. NOT NULL guard on payments.org_id — no-op if already NOT NULL (it is,
--      per 001_initial_schema), safe to keep as a belt-and-suspenders check.
--   5. COMMENT ON TABLE for error_log, job_runs, audit_log — documents retention.
--
-- No CONCURRENTLY — Supabase SQL editor runs inside a transaction block.
-- All operations are non-destructive and idempotent.

-- ── 1. audit_log index — SKIPPED (already exists from 007) ─────────────────
-- migration 007 created: audit_log_org_created ON audit_log(org_id, created_at DESC)
-- Creating idx_audit_log_org_created would be a functionally identical duplicate.
-- No action needed.

-- ── 2. payments — paid-only revenue partial index ───────────────────────────
-- Revenue dashboards filter WHERE status = 'paid' — this partial index covers
-- that pattern efficiently without scanning pending/failed rows.
-- Wrapped in DO block because payments.deleted_at has no explicit ADD COLUMN
-- migration: if the column exists (expected) the index is created; if it does
-- not exist the block skips gracefully rather than aborting the entire migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'payments'
      AND column_name = 'deleted_at'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'idx_payments_org_paid_created'
    ) THEN
      EXECUTE '
        CREATE INDEX idx_payments_org_paid_created
          ON payments(org_id, created_at DESC)
          WHERE status = ''paid'' AND deleted_at IS NULL
      ';
    END IF;
  ELSE
    -- deleted_at column missing — create a simpler index without that filter.
    -- This will still accelerate revenue queries, just without the soft-delete guard.
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'idx_payments_org_paid_created'
    ) THEN
      EXECUTE '
        CREATE INDEX idx_payments_org_paid_created
          ON payments(org_id, created_at DESC)
          WHERE status = ''paid''
      ';
    END IF;
  END IF;
END $$;

-- ── 3. lead_events index — SKIPPED (already exists from 026) ───────────────
-- migration 026 created: lead_events_lead_created ON lead_events(lead_id, created_at DESC)
-- Creating idx_lead_events_lead_created would be a functionally identical duplicate.
-- No action needed.

-- ── 4. Protect org_id on payments ──────────────────────────────────────────
-- payments.org_id is already NOT NULL per 001_initial_schema (UUID NOT NULL).
-- This block is a no-op in practice but documents intent and is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name   = 'payments'
      AND column_name  = 'org_id'
      AND is_nullable  = 'NO'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM payments WHERE org_id IS NULL LIMIT 1) THEN
      ALTER TABLE payments ALTER COLUMN org_id SET NOT NULL;
    END IF;
  END IF;
END $$;

-- ── 5. Document retention policies via table comments ──────────────────────
COMMENT ON TABLE error_log IS
  'Server-side error log. Rows older than 90 days may be pruned. '
  'Service role write-only. Query via /admin/errors.';

COMMENT ON TABLE job_runs IS
  'Inngest function execution log. Rows older than 30 days may be pruned. '
  'Written by lib/job-logger.ts. Service role write-only.';

COMMENT ON TABLE audit_log IS
  'Business event audit trail. Retain indefinitely for compliance. '
  'Written by lib/audit.ts. Service role write-only.';
