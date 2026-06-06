-- 025_conversations_deleted_at.sql
--
-- ROOT CAUSE FIX: inbox shows zero conversations for all channels.
--
-- The inbox layout (app/(app)/org/[orgSlug]/inbox/layout.tsx) and the
-- inbox API route (app/api/orgs/[orgId]/inbox/route.ts) both filter with
--   .is("deleted_at", null)
-- but the conversations table never had a deleted_at column added via
-- any migration. PostgREST returns an error when filtering on a
-- non-existent column, causing data=null and an empty inbox for every
-- channel (WhatsApp, Instagram, manual).
--
-- This migration adds the column and a partial index for the common
-- query pattern (active conversations ordered by last_message_at).

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index used by inbox list queries
CREATE INDEX IF NOT EXISTS idx_conversations_org_active
  ON conversations (org_id, last_message_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;
