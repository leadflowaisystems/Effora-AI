-- Migration 019: Groups, Broadcasts, and Broadcast Deliveries
-- Run this in the Supabase SQL Editor.

-- ── lead_groups ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  tag         TEXT NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('instagram','whatsapp','both')),
  description TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  UNIQUE(org_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_lead_groups_org
  ON lead_groups(org_id) WHERE deleted_at IS NULL;

-- ── lead_group_members ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_group_members (
  group_id UUID NOT NULL REFERENCES lead_groups(id) ON DELETE CASCADE,
  lead_id  UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (group_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_group_members_group ON lead_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_lead_group_members_lead  ON lead_group_members(lead_id);

-- ── broadcasts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcasts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  group_id          UUID REFERENCES lead_groups(id) ON DELETE SET NULL,
  channel           TEXT NOT NULL,
  message_template  TEXT NOT NULL,
  template_id       TEXT,
  variables         JSONB,
  status            TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','completed','failed','cancelled')),
  send_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  total_recipients  INTEGER NOT NULL DEFAULT 0,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_org
  ON broadcasts(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_pending
  ON broadcasts(send_at) WHERE status = 'queued';

-- ── broadcast_deliveries ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id     UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel          TEXT NOT NULL,
  rendered_message TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','sent','delivered','read','failed','skipped')),
  sent_at          TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  read_at          TIMESTAMPTZ,
  failed_reason    TEXT,
  message_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_broadcast
  ON broadcast_deliveries(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_lead
  ON broadcast_deliveries(lead_id);

-- ── RLS policies ──────────────────────────────────────────────────────────────
ALTER TABLE lead_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_groups_org_access"        ON lead_groups;
DROP POLICY IF EXISTS "lead_group_members_access"     ON lead_group_members;
DROP POLICY IF EXISTS "broadcasts_org_access"         ON broadcasts;
DROP POLICY IF EXISTS "broadcast_deliveries_access"   ON broadcast_deliveries;

CREATE POLICY "lead_groups_org_access" ON lead_groups
  USING (is_org_member(org_id));

CREATE POLICY "lead_group_members_access" ON lead_group_members
  USING (
    EXISTS (
      SELECT 1 FROM lead_groups g
      WHERE g.id = lead_group_members.group_id
        AND is_org_member(g.org_id)
    )
  );

CREATE POLICY "broadcasts_org_access" ON broadcasts
  USING (is_org_member(org_id));

CREATE POLICY "broadcast_deliveries_access" ON broadcast_deliveries
  USING (
    EXISTS (
      SELECT 1 FROM broadcasts b
      WHERE b.id = broadcast_deliveries.broadcast_id
        AND is_org_member(b.org_id)
    )
  );

-- ── Add phone column to leads if missing ─────────────────────────────────────
-- (phone might already be in metadata; this gives us a proper indexed column)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_handle TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_phone    ON leads(phone)    WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_ig       ON leads(instagram_handle) WHERE instagram_handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_org_channel ON leads(org_id, channel) WHERE deleted_at IS NULL;
