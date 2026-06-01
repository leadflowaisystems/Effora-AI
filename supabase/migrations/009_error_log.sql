-- 009_error_log.sql
-- Server-side error log for queryable observability without Sentry.
-- Rows are written by lib/log.ts via service role (bypasses RLS).

CREATE TABLE IF NOT EXISTS error_log (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID        REFERENCES orgs(id) ON DELETE SET NULL,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  route         TEXT,
  error_message TEXT        NOT NULL,
  stack         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

-- Only admins (service role) can read/write; regular users have no access.
-- Service-role bypasses RLS so lib/log.ts inserts work without issue.
CREATE POLICY "error_log_deny_all" ON error_log
  FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_org     ON error_log(org_id, created_at DESC);
