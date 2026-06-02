-- Migration 020: Add compliance_flags JSONB to user_flags
-- Stores flexible acceptance flags (broadcast_policy_accepted, etc.)
-- Run in Supabase SQL Editor.

ALTER TABLE user_flags ADD COLUMN IF NOT EXISTS compliance_flags JSONB DEFAULT '{}'::jsonb;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_flags_user_org
  ON user_flags(user_id, org_id);
