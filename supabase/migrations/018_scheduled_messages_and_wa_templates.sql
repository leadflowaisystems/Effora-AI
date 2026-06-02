-- Migration 018: Scheduled messages + WhatsApp templates
-- Run this in the Supabase SQL Editor.

-- ── scheduled_messages ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  conversation_id  UUID REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  channel          TEXT NOT NULL DEFAULT 'whatsapp_cloud',
  content          TEXT NOT NULL,
  template_id      TEXT,
  template_params  JSONB,
  send_at          TIMESTAMPTZ NOT NULL,
  sent_at          TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  error            TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending
  ON scheduled_messages(send_at)
  WHERE sent_at IS NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_org
  ON scheduled_messages(org_id, send_at);

ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_messages_org_access" ON scheduled_messages;
CREATE POLICY "scheduled_messages_org_access" ON scheduled_messages
  USING (is_org_member(org_id));

-- ── whatsapp_templates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT DEFAULT 'UTILITY' CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  body             TEXT NOT NULL,
  variables        TEXT[] DEFAULT '{}',
  meta_template_id TEXT,
  approval_status  TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','submitted','approved','rejected')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_org
  ON whatsapp_templates(org_id, approval_status);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_templates_org_access" ON whatsapp_templates;
CREATE POLICY "whatsapp_templates_org_access" ON whatsapp_templates
  USING (is_org_member(org_id));

-- Seed three starter templates (using INSERT ... ON CONFLICT DO NOTHING so it's safe to re-run)
-- These are inserted without an org_id since they're global starters; orgs can clone them.
-- We'll insert them as org-specific when the org connects WhatsApp.

-- ── broadcast_sends (track per-recipient status for bulk sends) ────────────
CREATE TABLE IF NOT EXISTS broadcast_sends (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  template_id      UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  phone            TEXT,
  template_params  JSONB,
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error            TEXT,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  broadcast_batch  UUID -- groups sends from the same bulk operation
);

CREATE INDEX IF NOT EXISTS idx_broadcast_sends_org
  ON broadcast_sends(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_sends_batch
  ON broadcast_sends(broadcast_batch);

ALTER TABLE broadcast_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_sends_org_access" ON broadcast_sends;
CREATE POLICY "broadcast_sends_org_access" ON broadcast_sends
  USING (is_org_member(org_id));
