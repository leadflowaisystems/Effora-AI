-- ============================================================
-- CoachOS — Phase 1: onboarding, channel config, voice profiles
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── Extend orgs ────────────────────────────────────────────
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS channel_config          JSONB NOT NULL DEFAULT '{}';

-- ── Extend integrations ────────────────────────────────────
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── Voice profiles (1-per-org) ──────────────────────────────
CREATE TABLE IF NOT EXISTS voice_profiles (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  tone          TEXT        NOT NULL DEFAULT 'professional',
  offer         TEXT        NOT NULL DEFAULT '',
  price_range   TEXT        NOT NULL DEFAULT '',
  sells         TEXT        NOT NULL DEFAULT '',
  objections    JSONB       NOT NULL DEFAULT '[]',
  extra_context TEXT        NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id)
);

ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;

-- Members of the org can read/write their own voice profile
DROP POLICY IF EXISTS "voice_member_all" ON voice_profiles;
CREATE POLICY "voice_member_all" ON voice_profiles
  FOR ALL USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_voice_profiles_org_id ON voice_profiles(org_id);

-- ── orgs: allow owners to update onboarding fields via RLS ──
-- (writes go through service-role API routes so RLS not strictly
--  needed here, but good to be explicit)
DROP POLICY IF EXISTS "orgs_update_owner" ON orgs;
CREATE POLICY "orgs_update_owner" ON orgs
  FOR UPDATE USING (is_org_owner(id));
