-- ============================================================
-- 011_completion.sql
-- Tables required by the completion audit pass.
-- Apply manually in Supabase SQL Editor.
-- ============================================================

-- ── user_flags ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_flags (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id                  uuid NOT NULL REFERENCES orgs(id)       ON DELETE CASCADE,
  has_completed_first_run boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

ALTER TABLE user_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own flags"
  ON user_flags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can upsert own flags"
  ON user_flags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own flags"
  ON user_flags FOR UPDATE
  USING (auth.uid() = user_id);

-- ── brevo_send_log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brevo_send_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        uuid REFERENCES orgs(id) ON DELETE SET NULL,
  lead_id       uuid REFERENCES leads(id) ON DELETE SET NULL,
  template_name text NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brevo_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view send log"
  ON brevo_send_log FOR SELECT
  USING (is_org_member(org_id));

-- ── user_push_subscriptions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES orgs(id)       ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

ALTER TABLE user_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own push subscriptions"
  ON user_push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
