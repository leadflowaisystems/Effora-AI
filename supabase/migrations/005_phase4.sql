-- ============================================================
-- CoachOS — Phase 4: payments, dunning, ghost revival
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── Add 'won' to leads stage ────────────────────────────────
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE leads ADD CONSTRAINT leads_stage_check
  CHECK (stage IN ('cold','warm','hot','booking_sent','booked','qualified','won','paid','churned'));

-- ── Extend payments table ───────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_link_id  TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS notes            TEXT;

-- ── Sequence runs (dunning + ghost revival tracking) ────────
CREATE TABLE IF NOT EXISTS sequence_runs (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id UUID        REFERENCES conversations(id) ON DELETE SET NULL,
  type            TEXT        NOT NULL CHECK (type IN ('dunning','ghost_revival')),
  status          TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','stopped','flagged')),
  step_current    INT         NOT NULL DEFAULT 0,
  step_total      INT         NOT NULL DEFAULT 3,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at      TIMESTAMPTZ
);

ALTER TABLE sequence_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seq_runs_member_all" ON sequence_runs;
CREATE POLICY "seq_runs_member_all" ON sequence_runs
  FOR ALL USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_seq_runs_org_id   ON sequence_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_seq_runs_lead_id  ON sequence_runs(lead_id);
CREATE INDEX IF NOT EXISTS idx_seq_runs_status   ON sequence_runs(status);
CREATE INDEX IF NOT EXISTS idx_seq_runs_type     ON sequence_runs(type);

-- ── RLS for payments ────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_member_all" ON payments;
CREATE POLICY "payments_member_all" ON payments
  FOR ALL USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_payments_org_id   ON payments(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_lead_id  ON payments(lead_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON payments(status);
