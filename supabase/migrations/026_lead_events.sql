-- 026_lead_events.sql
-- Event-sourced lead history. Every booking/payment lifecycle action
-- writes a row here so the Activity Timeline is a durable, append-only log.
--
-- entity_id is intentionally NOT a FK — hard-deleted bookings/payments
-- must not break historical event records.

CREATE TABLE IF NOT EXISTS lead_events (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        NOT NULL REFERENCES orgs(id)  ON DELETE CASCADE,
  lead_id     UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,   -- see event types below
  entity_type TEXT        NOT NULL,   -- 'booking' | 'payment'
  entity_id   UUID,                   -- nullable: no FK, survives hard deletes
  title       TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast timeline queries
CREATE INDEX IF NOT EXISTS lead_events_lead_created
  ON lead_events (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_events_org_created
  ON lead_events (org_id, created_at DESC);

-- Valid event_type values (enforced by application, not DB constraint so we
-- can add types without a migration):
--   booking_created, booking_completed, booking_no_show,
--   booking_archived, booking_deleted,
--   payment_created, payment_paid, payment_archived, payment_deleted
