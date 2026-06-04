-- Migration 021: Analytics events table
-- Lightweight internal event tracking (no third-party analytics)
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS analytics_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        REFERENCES orgs(id) ON DELETE SET NULL,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  event      TEXT        NOT NULL,
  properties JSONB       DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_org   ON analytics_events(org_id, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON analytics_events(event, created_at DESC);

-- No RLS — only written by service role (API routes), read by admin only.
-- No sensitive PII stored here — only event names and metadata.
