-- ============================================================
-- CoachOS — Phase 2: inbox, messages, AI drafts, usage tracking
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── Extend orgs ────────────────────────────────────────────
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS auto_send_replies BOOLEAN NOT NULL DEFAULT false;

-- ── Extend leads ───────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS channel      TEXT        NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id  TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill external_id for rows that still have the empty default
UPDATE leads SET external_id = uuid_generate_v4()::TEXT WHERE external_id = '';

-- Migrate old 'new' stage to 'cold'
UPDATE leads SET stage = 'cold' WHERE stage = 'new';

-- Replace stage CHECK constraint to include hot/warm/cold
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE leads ADD CONSTRAINT leads_stage_check
  CHECK (stage IN ('cold','warm','hot','qualified','booked','paid','churned'));

ALTER TABLE leads ALTER COLUMN stage SET DEFAULT 'cold';

-- Unique constraint for upsert on (org, channel, external_id)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_org_channel_external_id_key;
ALTER TABLE leads ADD CONSTRAINT leads_org_channel_external_id_key
  UNIQUE (org_id, channel, external_id);

-- ── Extend conversations ────────────────────────────────────
-- Drop embedded JSONB messages array — replaced by messages table
ALTER TABLE conversations DROP COLUMN IF EXISTS messages;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT;

-- Unique constraint: one thread per lead per channel
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_org_lead_channel_key;
ALTER TABLE conversations ADD CONSTRAINT conversations_org_lead_channel_key
  UNIQUE (org_id, lead_id, channel_provider);

-- ── Messages table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id     UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  org_id              UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  direction           TEXT        NOT NULL CHECK (direction IN ('inbound','outbound')),
  content             TEXT        NOT NULL,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_message_id TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}'
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_member_all" ON messages;
CREATE POLICY "messages_member_all" ON messages
  FOR ALL USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_messages_conv_sent
  ON messages(conversation_id, sent_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_org_sent
  ON messages(org_id, sent_at DESC);

-- ── AI drafts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_drafts (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  org_id          UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  message_id      UUID        REFERENCES messages(id) ON DELETE SET NULL,
  content         TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','sent','rejected','edited')),
  edited_content  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_drafts_member_all" ON ai_drafts;
CREATE POLICY "ai_drafts_member_all" ON ai_drafts
  FOR ALL USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_ai_drafts_conv
  ON ai_drafts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_org_status
  ON ai_drafts(org_id, status);

-- ── AI usage tracking ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  month       DATE          NOT NULL,   -- first day of month, e.g. 2026-05-01
  tokens_in   BIGINT        NOT NULL DEFAULT 0,
  tokens_out  BIGINT        NOT NULL DEFAULT 0,
  cost_inr    NUMERIC(12,4) NOT NULL DEFAULT 0,
  UNIQUE(org_id, month)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_member_all" ON ai_usage;
CREATE POLICY "ai_usage_member_all" ON ai_usage
  FOR ALL USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_month
  ON ai_usage(org_id, month DESC);
