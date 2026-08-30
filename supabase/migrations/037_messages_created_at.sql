-- 037_messages_created_at.sql
--
-- INSTRUMENTATION ONLY — purely additive, no behaviour change.
--
-- Why this exists
-- ---------------
-- `messages.sent_at` is polymorphic and therefore cannot be used to measure
-- Effora's own processing time:
--
--   inbound WhatsApp  -> Meta's message timestamp, second precision
--                        (app/api/webhooks/whatsapp/route.ts: new Date(parseInt(msg.timestamp) * 1000))
--   inbound Instagram -> Meta's messaging.timestamp
--   outbound / other  -> server clock at insert time
--
-- So for inbound rows `sent_at` is "when Meta says the customer sent it", not
-- "when Effora received it". Without a server-side receipt timestamp there is
-- no way to separate Meta's delivery latency from our processing latency.
--
-- `created_at` is a server-clock timestamp written by the database on INSERT
-- and never set by application code, giving an unambiguous "when the row
-- reached us" marker for every channel.
--
-- Design notes
-- ------------
-- 1. The column is added WITHOUT a default first, then the default is set.
--    This deliberately leaves every pre-existing row NULL rather than
--    backfilling them with the migration's own timestamp, which would be
--    actively misleading in latency analysis. NULL honestly means
--    "not measured".
-- 2. No index. Analysis queries filter by conversation_id (already indexed)
--    and the table is small; an index is not demonstrably necessary and would
--    add write cost on the hot inbound path.
-- 3. Nullable, no NOT NULL constraint — nothing in the application depends on
--    it, so it can never fail an insert.
-- 4. Idempotent: safe to run more than once.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE messages
  ALTER COLUMN created_at SET DEFAULT NOW();

COMMENT ON COLUMN messages.created_at IS
  'Server clock at row insert. Instrumentation only. NULL for rows created before migration 037. Use with sent_at to separate provider delivery latency from Effora processing latency: for inbound Meta channels sent_at is the provider timestamp, so (created_at - sent_at) is the provider delivery leg.';
