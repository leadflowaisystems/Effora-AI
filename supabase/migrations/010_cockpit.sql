-- 010_cockpit.sql
-- AI Coach Cockpit tables: funnel pages, push subscriptions, screenshot processing

-- ── 1. Coach funnel page config ────────────────────────────────
-- One config per org. The public page lives at /c/[orgSlug].
CREATE TABLE IF NOT EXISTS funnel_configs (
  org_id          UUID        PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  headline        TEXT        NOT NULL DEFAULT 'Work with me',
  subheadline     TEXT        NOT NULL DEFAULT '',
  offer_desc      TEXT        NOT NULL DEFAULT '',
  cta_text        TEXT        NOT NULL DEFAULT 'Apply to work with me',
  photo_url       TEXT,
  video_url       TEXT,
  pricing_teaser  TEXT,
  published       BOOLEAN     NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE funnel_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnel_member_all" ON funnel_configs
  FOR ALL USING (is_org_member(org_id));

-- ── 2. PWA push subscriptions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id, endpoint)
);

ALTER TABLE user_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_self" ON user_push_subscriptions
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_push_org ON user_push_subscriptions(org_id);

-- ── 3. Screenshot processing log ───────────────────────────────
CREATE TABLE IF NOT EXISTS process_screenshots (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  threads_found   INT         NOT NULL DEFAULT 0,
  drafts_generated INT        NOT NULL DEFAULT 0,
  ai_calls_used   INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE process_screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "screenshots_member_all" ON process_screenshots
  FOR ALL USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_screenshots_org ON process_screenshots(org_id, created_at DESC);

-- ── 4. WhatsApp settings in integrations (already have table) ──
-- WhatsApp stored as integrations row with provider='whatsapp',
-- config = { number, country_code, greeting, click_to_chat_url }
-- No new table needed.

-- ── 5. types/database.ts additions ─────────────────────────────
-- (Added manually in types/database.ts — see comment below)
