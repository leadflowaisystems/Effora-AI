-- 012_starter_value.sql
-- Add CRM fields to leads, indexes for CRM queries.
-- Apply manually in Supabase SQL Editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tags         text[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes        text,
  ADD COLUMN IF NOT EXISTS ltv_inr      numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_at  timestamptz,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;

-- CRM query indexes
CREATE INDEX IF NOT EXISTS idx_leads_org_stage_deleted
  ON leads (org_id, stage) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_org_tags
  ON leads USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_leads_org_last_seen
  ON leads (org_id, last_seen_at DESC NULLS LAST) WHERE deleted_at IS NULL;

-- Add UPI ID to orgs table
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS upi_id text;

-- brevo_send_log already in 011, skip if exists
CREATE TABLE IF NOT EXISTS brevo_send_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        uuid REFERENCES orgs(id) ON DELETE SET NULL,
  lead_id       uuid REFERENCES leads(id) ON DELETE SET NULL,
  template_name text NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brevo_send_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brevo_send_log' AND policyname = 'org members can view send log'
  ) THEN
    CREATE POLICY "org members can view send log"
      ON brevo_send_log FOR SELECT
      USING (is_org_member(org_id));
  END IF;
END$$;
