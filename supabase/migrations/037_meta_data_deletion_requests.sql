-- 037_meta_data_deletion_requests.sql
-- Tracks Meta User Data Deletion Callback requests so the status URL
-- returned to Meta (and shown to the requester) can be resolved later.
-- Required for Meta App Review: the callback must return a confirmation_code
-- and a URL where that code's status can be checked.

CREATE TABLE IF NOT EXISTS meta_data_deletion_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_code TEXT        NOT NULL UNIQUE,
  meta_user_id      TEXT        NOT NULL,           -- Meta-scoped user ID from the signed_request
  status            TEXT        NOT NULL DEFAULT 'pending',  -- pending | completed
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  CONSTRAINT meta_data_deletion_requests_status_check CHECK (status IN ('pending', 'completed'))
);

-- Service-role only; the public status page and the callback both use the service client.
ALTER TABLE meta_data_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_data_deletion_requests_deny_all" ON meta_data_deletion_requests FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_meta_data_deletion_requests_code
  ON meta_data_deletion_requests (confirmation_code);
