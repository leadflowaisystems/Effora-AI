-- Migration 020: Add compliance_flags to user_flags
--
-- The user_flags table was created in migration 007 with schema:
--   user_flags(user_id UUID PRIMARY KEY, is_agency BOOLEAN, created_at TIMESTAMPTZ)
-- There is NO org_id column. Migration 011's CREATE TABLE IF NOT EXISTS was a no-op.
--
-- Approach A: add compliance_flags JSONB scoped by org_id INSIDE the JSON.
-- e.g. compliance_flags = { "org-uuid": { "broadcast_policy_accepted": "2024-01-01T..." } }
--
-- Run this in Supabase SQL Editor.

ALTER TABLE user_flags
  ADD COLUMN IF NOT EXISTS compliance_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_flags_user_id ON user_flags(user_id);
