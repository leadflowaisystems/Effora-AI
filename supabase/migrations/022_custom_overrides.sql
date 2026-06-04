-- 022_custom_overrides.sql
-- Stores the coach-supplied custom_message on booking and payment rows for audit trail.
-- Apply manually in Supabase SQL Editor.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS custom_message text;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS custom_message text;
