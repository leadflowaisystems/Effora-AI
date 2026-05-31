-- 008_indexes.sql
-- Production performance indexes.
-- All use IF NOT EXISTS so safe to re-run.

CREATE INDEX IF NOT EXISTS idx_leads_org_stage 
  ON leads(org_id, stage);

CREATE INDEX IF NOT EXISTS idx_conversations_lead 
  ON conversations(lead_id);

CREATE INDEX IF NOT EXISTS idx_messages_conv_sent 
  ON messages(conversation_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_org_status 
  ON payments(org_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_month 
  ON ai_usage(org_id, month);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_created 
  ON audit_log(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_org_status 
  ON bookings(org_id, status);