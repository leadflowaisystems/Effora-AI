-- 031_job_runs.sql
-- Lightweight Inngest function execution log.
-- Written by lib/job-logger.ts on every function start/complete/fail.
-- Gives local visibility into background job health without requiring
-- the Inngest cloud dashboard for every diagnosis.
--
-- Retention: rows older than 30 days should be pruned by a cron
-- (or manually). The table never holds sensitive data.

CREATE TABLE IF NOT EXISTS job_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT        NOT NULL,             -- Inngest function ID e.g. "on-weekly-report"
  event_name    TEXT,                              -- triggering event name
  org_id        UUID        REFERENCES orgs(id) ON DELETE SET NULL,
  status        TEXT        NOT NULL DEFAULT 'started',  -- started | completed | failed
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  duration_ms   INTEGER,                           -- null if still running
  error_message TEXT,                              -- set on failed
  attempt       INTEGER     NOT NULL DEFAULT 1,
  run_id        TEXT,                              -- Inngest runId for cross-referencing
  CONSTRAINT job_runs_status_check CHECK (status IN ('started', 'completed', 'failed'))
);

-- Admin reads only; all writes go through service role.
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_runs_deny_all" ON job_runs FOR ALL USING (false);

-- Indexes for admin health dashboard queries
CREATE INDEX IF NOT EXISTS idx_job_runs_fn_started
  ON job_runs(function_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_runs_status_started
  ON job_runs(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_runs_org_started
  ON job_runs(org_id, started_at DESC)
  WHERE org_id IS NOT NULL;

-- Prune rows older than 30 days (run manually or via pg_cron if available)
-- DELETE FROM job_runs WHERE started_at < NOW() - INTERVAL '30 days';
