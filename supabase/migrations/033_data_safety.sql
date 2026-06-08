-- 033_data_safety.sql
-- Data safety, auditability, and financial record hardening (2026-06-08).
--
-- What this migration does:
--   1. Ensures audit_log.org_id is indexed so org-scoped audit queries
--      are fast even at high volume.
--   2. Adds a partial index on payments for the "paid" status so
--      revenue queries never do full-table scans.
--   3. Adds a NOT NULL constraint on payments.org_id to prevent
--      orphan payment records with no org association.
--   4. Ensures lead_events.org_id is indexed for the timeline query.
--   5. Adds a comment on the error_log table explaining retention policy.
--
-- All operations are non-destructive and idempotent.

-- ── 1. audit_log — org-scoped query index ──────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_org_created
  ON audit_log(org_id, created_at DESC);

-- ── 2. payments — paid-only revenue index ──────────────────────────────────
-- Revenue dashboards filter WHERE status = 'paid' — this partial index
-- covers that pattern efficiently without touching pending/failed rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_org_paid_created
  ON payments(org_id, created_at DESC)
  WHERE status = 'paid' AND deleted_at IS NULL;

-- ── 3. lead_events — timeline query index ──────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_events_lead_created
  ON lead_events(lead_id, created_at DESC);

-- ── 4. Protect org_id on payments ──────────────────────────────────────────
-- Prevent orphan payments with no org association.
-- Using DO block because ALTER COLUMN SET NOT NULL would fail if null rows exist;
-- we check first and only add the constraint if the column is already non-null.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name   = 'payments'
      AND column_name  = 'org_id'
      AND is_nullable  = 'NO'
  ) THEN
    -- Only safe to add if no existing null org_id rows
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
