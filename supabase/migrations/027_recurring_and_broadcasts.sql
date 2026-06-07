-- 027_recurring_and_broadcasts.sql
-- Adds: broadcast partial status + soft-delete, recurring payments, recurring bookings,
--       lead-event deletability, scheduled_at on payments.

-- ── Broadcasts: add partial status + soft-delete + name ──────────────────────
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS name       TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE broadcasts
  ADD CONSTRAINT broadcasts_status_check
    CHECK (status IN ('queued','sending','running','completed','partial','failed','cancelled'));

CREATE INDEX IF NOT EXISTS idx_broadcasts_active
  ON broadcasts(org_id, created_at DESC)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

-- ── Payments: recurring support + scheduled send ──────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_type        TEXT    NOT NULL DEFAULT 'one_time'
    CHECK (payment_type IN ('one_time','recurring')),
  ADD COLUMN IF NOT EXISTS recurrence_frequency TEXT
    CHECK (recurrence_frequency IS NULL OR
           recurrence_frequency IN ('daily','weekly','monthly','yearly')),
  ADD COLUMN IF NOT EXISTS next_run_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS template_name       TEXT,
  ADD COLUMN IF NOT EXISTS template_active     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scheduled_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS template_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_recurring
  ON payments(org_id, payment_type, next_run_at)
  WHERE payment_type = 'recurring' AND template_active = true AND deleted_at IS NULL;

-- ── Bookings: recurring support + scheduled send ──────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_type         TEXT    NOT NULL DEFAULT 'one_time'
    CHECK (booking_type IN ('one_time','recurring')),
  ADD COLUMN IF NOT EXISTS recurrence_frequency TEXT
    CHECK (recurrence_frequency IS NULL OR
           recurrence_frequency IN ('daily','weekly','monthly','yearly')),
  ADD COLUMN IF NOT EXISTS next_run_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS template_name        TEXT,
  ADD COLUMN IF NOT EXISTS template_active      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scheduled_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS template_booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_recurring
  ON bookings(org_id, booking_type, next_run_at)
  WHERE booking_type = 'recurring' AND template_active = true AND deleted_at IS NULL;

-- ── lead_events: allow deletion (add deleted_at marker) ───────────────────────
-- We don't physically delete events by default; instead we mark them hidden.
ALTER TABLE lead_events
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_lead_events_active
  ON lead_events(lead_id, created_at DESC)
  WHERE deleted_at IS NULL;
