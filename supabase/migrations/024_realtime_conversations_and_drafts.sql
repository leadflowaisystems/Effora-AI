-- 024_realtime_conversations_and_drafts.sql
--
-- ROOT CAUSE FIX for inbox performance.
--
-- The supabase_realtime publication previously contained only the `messages`
-- table. The `conversations` and `ai_drafts` tables were missing, so every
-- postgres_changes subscription in inbox-shell.tsx for conversation
-- INSERT/UPDATE events received ZERO events. The client-side realtime
-- subscriptions subscribed successfully (no error) but Postgres never
-- broadcast anything.
--
-- Effects of the missing publication:
--   - Conversations never moved to top automatically on new messages.
--   - New inbound DMs did not appear in the sidebar without a manual refresh.
--   - AI draft cards only appeared after the 5s poll interval.
--   - router.refresh() was added as a workaround — it caused layout
--     re-renders, state overwrites, and visible flicker on every send.
--
-- This migration:
--   1. Adds conversations to the publication (enables sidebar live updates).
--   2. Adds ai_drafts to the publication (enables instant draft card appearance).
--   3. Sets REPLICA IDENTITY FULL on both tables so UPDATE event payloads
--      carry all columns. Required for Supabase realtime to correctly apply
--      RLS and org_id filters on UPDATE/DELETE events.
--
-- Safe to run multiple times: ADD TABLE is idempotent when the table is
-- already in the publication (no-op, no error in Postgres 15+).
-- REPLICA IDENTITY FULL is idempotent.

-- ── 1. Add conversations to realtime ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
    RAISE NOTICE 'Added conversations to supabase_realtime publication.';
  ELSE
    RAISE NOTICE 'conversations already in supabase_realtime publication — skipping.';
  END IF;
END $$;

-- ── 2. Add ai_drafts to realtime ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ai_drafts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ai_drafts;
    RAISE NOTICE 'Added ai_drafts to supabase_realtime publication.';
  ELSE
    RAISE NOTICE 'ai_drafts already in supabase_realtime publication — skipping.';
  END IF;
END $$;

-- ── 3. REPLICA IDENTITY FULL ─────────────────────────────────────────────────
-- Required so Supabase realtime can apply RLS filters and send full row data
-- in UPDATE event payloads. Without FULL, UPDATE events carry only the PK
-- in payload.old, breaking org_id-filtered subscriptions.
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE ai_drafts     REPLICA IDENTITY FULL;

-- ── 4. Verify ─────────────────────────────────────────────────────────────────
-- Run after applying to confirm:
--
--   SELECT pubname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' ORDER BY tablename;
--
--   SELECT relname, CASE relreplident
--     WHEN 'f' THEN 'FULL' WHEN 'd' THEN 'DEFAULT'
--     ELSE relreplident::text END AS replica_identity
--   FROM pg_class WHERE relname IN ('conversations','ai_drafts','messages');
