-- 015_instagram.sql
-- Adds Instagram DM support: auto_reply toggle on conversations + webhook events debug table

-- Per-conversation AI auto-reply toggle (default ON)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN NOT NULL DEFAULT true;

-- Webhook events log (for Meta webhook debug panel in /settings/channel/instagram)
CREATE TABLE IF NOT EXISTS webhook_events (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID        REFERENCES orgs(id) ON DELETE CASCADE,
  provider   TEXT        NOT NULL,
  event_type TEXT        NOT NULL,
  sender_id  TEXT,
  payload    JSONB       NOT NULL DEFAULT '{}',
  verified   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_org_provider
  ON webhook_events(org_id, provider, created_at DESC);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view webhook events"
  ON webhook_events FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );
