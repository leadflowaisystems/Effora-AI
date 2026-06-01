-- Phase 5: pre-aggregated metrics for dashboard

CREATE TABLE IF NOT EXISTS metrics_daily (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,

  -- Funnel
  dms_received    INT NOT NULL DEFAULT 0,
  leads_qualified INT NOT NULL DEFAULT 0,
  leads_booked    INT NOT NULL DEFAULT 0,
  leads_showed    INT NOT NULL DEFAULT 0,
  leads_paid      INT NOT NULL DEFAULT 0,

  -- Revenue (paise → store as integer INR)
  revenue_paid_inr    BIGINT NOT NULL DEFAULT 0,
  revenue_dunning_inr BIGINT NOT NULL DEFAULT 0,
  revenue_revival_inr BIGINT NOT NULL DEFAULT 0,
  revenue_noshow_inr  BIGINT NOT NULL DEFAULT 0,
  pipeline_inr        BIGINT NOT NULL DEFAULT 0,

  -- Speed-to-lead: sum of ms + count (to compute mean on read)
  speed_sum_ms  BIGINT NOT NULL DEFAULT 0,
  speed_count   INT    NOT NULL DEFAULT 0,

  -- AI usage
  messages_ai INT    NOT NULL DEFAULT 0,
  tokens_used BIGINT NOT NULL DEFAULT 0,

  -- Source breakdown JSONB: { "reel": { leads: N, revenue_inr: M }, ... }
  source_breakdown JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(org_id, date)
);

-- RLS
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_metrics" ON metrics_daily
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = metrics_daily.org_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS metrics_daily_org_date
  ON metrics_daily(org_id, date DESC);
