-- ============================================================
-- CoachOS — Phase 3: auto-booking + no-show recovery
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── Add 'booking_sent' to leads stage ──────────────────────
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE leads ADD CONSTRAINT leads_stage_check
  CHECK (stage IN ('cold','warm','hot','booking_sent','booked','qualified','paid','churned'));

-- ── Extend bookings table ───────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS conversation_id  UUID        REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cal_booking_uid  TEXT,
  ADD COLUMN IF NOT EXISTS attendee_name    TEXT,
  ADD COLUMN IF NOT EXISTS attendee_email   TEXT,
  ADD COLUMN IF NOT EXISTS meeting_url      TEXT,
  ADD COLUMN IF NOT EXISTS recovery_attempt INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS notes            TEXT;

-- ── RLS for bookings ───────────────────────────────────────
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bookings_member_all" ON bookings;
CREATE POLICY "bookings_member_all" ON bookings
  FOR ALL USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_bookings_org_id     ON bookings(org_id);
CREATE INDEX IF NOT EXISTS idx_bookings_lead_id    ON bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_starts_at  ON bookings(starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status     ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_cal_uid    ON bookings(cal_booking_uid);
