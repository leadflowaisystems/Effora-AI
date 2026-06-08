-- 030_hardening_indexes.sql
-- Compound indexes to improve performance of high-frequency queries
-- identified in the platform hardening audit (2026-06-08).
--
-- All indexes are created with IF NOT EXISTS so this migration is idempotent.
-- None of these alter table structure or RLS policies.

-- ── leads ──────────────────────────────────────────────────────────────────

-- Every CRM/leads list query filters by org_id + deleted_at IS NULL.
-- A partial index on non-deleted rows is smaller and faster than a full index.
CREATE INDEX IF NOT EXISTS idx_leads_org_active
  ON leads(org_id, last_seen_at DESC)
  WHERE deleted_at IS NULL;

-- Search + stage filtering from CRM
CREATE INDEX IF NOT EXISTS idx_leads_org_stage_active
  ON leads(org_id, stage)
  WHERE deleted_at IS NULL;

-- Score-based qualification queries (dashboard live fallback, access checks)
CREATE INDEX IF NOT EXISTS idx_leads_org_score_active
  ON leads(org_id, score)
  WHERE deleted_at IS NULL;

-- ── payments ───────────────────────────────────────────────────────────────

-- Payment list pagination (org_id + deleted_at filter + created_at cursor)
CREATE INDEX IF NOT EXISTS idx_payments_org_active_created
  ON payments(org_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Payment stats queries filter by org + status + deleted_at
CREATE INDEX IF NOT EXISTS idx_payments_org_status_active
  ON payments(org_id, status)
  WHERE deleted_at IS NULL;

-- ── messages ───────────────────────────────────────────────────────────────

-- Messages are queried by org + sent_at for health/activity views
-- (channel_provider lives on conversations, not messages)
CREATE INDEX IF NOT EXISTS idx_messages_org_dir_sent
  ON messages(org_id, direction, sent_at DESC);

-- ── conversations ───────────────────────────────────────────────────────────

-- ManyChats health tab: last conversation per channel_provider
-- conversations.channel_provider is the correct column (not messages)
CREATE INDEX IF NOT EXISTS idx_conversations_org_channel_last
  ON conversations(org_id, channel_provider, last_message_at DESC);

-- ── broadcasts ─────────────────────────────────────────────────────────────

-- Broadcasts list (org + deleted_at filter + created_at sort)
CREATE INDEX IF NOT EXISTS idx_broadcasts_org_active_created
  ON broadcasts(org_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Broadcast status polling (on-broadcast-cron looks up by status)
CREATE INDEX IF NOT EXISTS idx_broadcasts_status_send_at
  ON broadcasts(status, send_at)
  WHERE deleted_at IS NULL;

-- ── sequence_runs ──────────────────────────────────────────────────────────

-- Ghost revival + scheduled payment crons filter by org + type + status + next_run_at
CREATE INDEX IF NOT EXISTS idx_seq_runs_org_type_status
  ON sequence_runs(org_id, type, status);

CREATE INDEX IF NOT EXISTS idx_seq_runs_next_run
  ON sequence_runs(next_run_at)
  WHERE status = 'active';

-- ── bookings ───────────────────────────────────────────────────────────────

-- Booking list pagination by org + created_at cursor
CREATE INDEX IF NOT EXISTS idx_bookings_org_created
  ON bookings(org_id, created_at DESC);

-- Dashboard live fallback: bookings by org + status + updated_at range
CREATE INDEX IF NOT EXISTS idx_bookings_org_status_updated
  ON bookings(org_id, status, updated_at DESC);

-- ── error_log ──────────────────────────────────────────────────────────────

-- Route-specific error queries for admin error dashboard
CREATE INDEX IF NOT EXISTS idx_error_log_route_created
  ON error_log(route, created_at DESC);
