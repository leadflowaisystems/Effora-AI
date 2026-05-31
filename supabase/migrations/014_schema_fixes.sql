-- 014_schema_fixes.sql
-- Adds missing columns that code already writes to.
-- Apply manually in Supabase SQL Editor.

-- ── bookings ─────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS source      text DEFAULT 'calcom',
  ADD COLUMN IF NOT EXISTS notes       text,
  ADD COLUMN IF NOT EXISTS meeting_url text;   -- fallback if calcom integration not present

-- ── payments ─────────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source         text DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS captured_at    timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS link_url       text,
  ADD COLUMN IF NOT EXISTS link_method    text;

-- ── Indexes for source-based filtering ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_org_source ON bookings (org_id, source);
CREATE INDEX IF NOT EXISTS idx_payments_org_source ON payments (org_id, source);
