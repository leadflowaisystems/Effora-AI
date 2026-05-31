-- ============================================================
-- CoachOS — Phase 0 initial schema
-- Apply via: Supabase Dashboard > SQL Editor, or supabase db push
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS orgs (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT          NOT NULL UNIQUE,
  name            TEXT          NOT NULL,
  plan            TEXT          NOT NULL DEFAULT 'free',
  ai_tokens_used  BIGINT        NOT NULL DEFAULT 0,
  ai_cost_inr     NUMERIC(12,4) NOT NULL DEFAULT 0,
  active_channel  TEXT          NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
  org_id      UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner','admin','member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS integrations (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  provider    TEXT        NOT NULL,
  config      JSONB       NOT NULL DEFAULT '{}',
  active      BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  score            INTEGER     NOT NULL DEFAULT 0,
  stage            TEXT        NOT NULL DEFAULT 'new'
                               CHECK (stage IN ('new','qualified','booked','paid','churned')),
  source           TEXT        NOT NULL DEFAULT 'manual',
  instagram_handle TEXT,
  name             TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id          UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel_provider TEXT        NOT NULL DEFAULT 'manual',
  messages         JSONB       NOT NULL DEFAULT '[]',
  last_message_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id      UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  cal_event_id TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','confirmed','no_show','completed','cancelled')),
  starts_at    TIMESTAMPTZ,
  ends_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id             UUID          NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  amount_inr          NUMERIC(12,2) NOT NULL DEFAULT 0,
  status              TEXT          NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','paid','failed','refunded')),
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sequences (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  trigger     TEXT        NOT NULL,
  steps       JSONB       NOT NULL DEFAULT '[]',
  active      BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics_daily (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  date             DATE          NOT NULL,
  dms_received     INTEGER       NOT NULL DEFAULT 0,
  leads_qualified  INTEGER       NOT NULL DEFAULT 0,
  bookings_created INTEGER       NOT NULL DEFAULT 0,
  revenue_inr      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, date)
);

CREATE TABLE IF NOT EXISTS events (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_org_members_user_id    ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_id           ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage            ON leads(org_id, stage);
CREATE INDEX IF NOT EXISTS idx_conversations_org_id   ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id  ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_org_id        ON bookings(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_id        ON payments(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org_type        ON events(org_id, type);
CREATE INDEX IF NOT EXISTS idx_metrics_org_date       ON metrics_daily(org_id, date);

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER so they see all rows)
-- ============================================================

CREATE OR REPLACE FUNCTION is_org_member(check_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_org_owner(check_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE orgs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE events        ENABLE ROW LEVEL SECURITY;

-- ORGS — read-only for members; all writes go through service role API routes
CREATE POLICY "orgs_select_member" ON orgs
  FOR SELECT USING (is_org_member(id));

-- ORG MEMBERS — members can see their org roster
CREATE POLICY "org_members_select_member" ON org_members
  FOR SELECT USING (is_org_member(org_id));

-- Owners can add/remove members (service role bypasses this for initial owner insert)
CREATE POLICY "org_members_insert_owner" ON org_members
  FOR INSERT WITH CHECK (is_org_owner(org_id));

CREATE POLICY "org_members_delete_owner" ON org_members
  FOR DELETE USING (is_org_owner(org_id));

-- All feature tables: full access if the user is a member of that org
CREATE POLICY "integrations_member_all"  ON integrations  FOR ALL USING (is_org_member(org_id));
CREATE POLICY "leads_member_all"         ON leads         FOR ALL USING (is_org_member(org_id));
CREATE POLICY "conversations_member_all" ON conversations FOR ALL USING (is_org_member(org_id));
CREATE POLICY "bookings_member_all"      ON bookings      FOR ALL USING (is_org_member(org_id));
CREATE POLICY "payments_member_all"      ON payments      FOR ALL USING (is_org_member(org_id));
CREATE POLICY "sequences_member_all"     ON sequences     FOR ALL USING (is_org_member(org_id));
CREATE POLICY "metrics_member_all"       ON metrics_daily FOR ALL USING (is_org_member(org_id));
CREATE POLICY "events_member_all"        ON events        FOR ALL USING (is_org_member(org_id));
