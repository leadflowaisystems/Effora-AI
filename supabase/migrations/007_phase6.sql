-- ============================================================
-- CoachOS — Phase 6: billing, agency, referrals, waitlist, admin
-- Apply via: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── 1. Billing fields on orgs ─────────────────────────────────
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS trial_ends_at         TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  ADD COLUMN IF NOT EXISTS subscription_id        TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status    TEXT NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS current_period_end     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monthly_ai_msg_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_msgs_reset_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Update plan default to 'trial' for new orgs
ALTER TABLE orgs ALTER COLUMN plan SET DEFAULT 'trial';

-- ── 2. Agency fields ──────────────────────────────────────────
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS agency_owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add is_agency flag to users metadata via a separate table
CREATE TABLE IF NOT EXISTS user_flags (
  user_id     UUID      PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_agency   BOOLEAN   NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_flags_self" ON user_flags
  FOR ALL USING (user_id = auth.uid());

-- ── 3. Referral fields on orgs ────────────────────────────────
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS referral_code   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by     TEXT;

-- ── 4. Waitlist table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email      TEXT        NOT NULL UNIQUE,
  source     TEXT        NOT NULL DEFAULT 'landing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
-- Only service role can read/write waitlist
CREATE POLICY "waitlist_service_only" ON waitlist
  FOR ALL USING (false);

-- ── 5. Audit log table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID        REFERENCES orgs(id) ON DELETE SET NULL,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  event      TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Owners can read their org's audit log
CREATE POLICY "audit_log_owner" ON audit_log
  FOR SELECT USING (is_org_owner(org_id));

CREATE INDEX IF NOT EXISTS audit_log_org_created ON audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created     ON audit_log(created_at DESC);

-- ── 6. indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orgs_agency_owner ON orgs(agency_owner_id) WHERE agency_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orgs_referral_code ON orgs(referral_code) WHERE referral_code IS NOT NULL;

-- ── 7. Generate referral codes for existing orgs ──────────────
-- (Run once; idempotent via WHERE referral_code IS NULL)
UPDATE orgs
  SET referral_code = UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8))
  WHERE referral_code IS NULL;

-- ── 8. Set trial plan on orgs that still have old 'free' plan ─
UPDATE orgs SET plan = 'trial' WHERE plan = 'free';
