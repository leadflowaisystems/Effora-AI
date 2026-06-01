-- 013_engagement.sql
-- Engagement layer: copilot chats, accountability, milestones, deep context.
-- Apply manually in Supabase SQL Editor.

-- ── Copilot chats ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_chats (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant')),
  content    text NOT NULL,
  metadata   jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE copilot_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can access copilot chats"
  ON copilot_chats FOR ALL USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_copilot_chats_org_created ON copilot_chats (org_id, created_at DESC);

-- ── Coach goals ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_goals (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title        text NOT NULL,
  target_value numeric,
  target_date  date,
  metric_type  text,  -- revenue | leads | calls | bookings | other
  current_value numeric DEFAULT 0,
  status       text DEFAULT 'active',  -- active | completed | paused
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coach_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can access goals" ON coach_goals FOR ALL
  USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));

-- ── Coach commitments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_commitments (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title        text NOT NULL,
  due_date     date NOT NULL,
  status       text DEFAULT 'pending',  -- pending | done | partial | missed
  notes        text,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coach_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can access commitments" ON coach_commitments FOR ALL
  USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));

-- ── Coach check-ins ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_checkins (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  date            date NOT NULL,
  commitment_id   uuid REFERENCES coach_commitments(id) ON DELETE SET NULL,
  status          text,  -- done | partial | missed
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coach_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can access checkins" ON coach_checkins FOR ALL
  USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));

-- ── Coach scorecards ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_scorecards (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  week_start   date NOT NULL,
  score        integer NOT NULL DEFAULT 0,
  metrics_json jsonb DEFAULT '{}',
  ai_insights  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coach_scorecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can access scorecards" ON coach_scorecards FOR ALL
  USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));

-- ── Milestones ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type        text NOT NULL,
  value       numeric,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb DEFAULT '{}'
);
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can read milestones" ON milestones FOR SELECT
  USING (is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_milestones_org ON milestones (org_id, achieved_at DESC);

-- ── Deep context on orgs ──────────────────────────────────────
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS deep_context jsonb DEFAULT '{}';
