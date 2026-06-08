-- 034_founder_accounts.sql
-- Creates a founder_accounts reference table.
-- The runtime check uses the FOUNDER_EMAILS env var (lib/founder.ts),
-- so this table is a record-keeping convenience — not queried at runtime.

CREATE TABLE IF NOT EXISTS founder_accounts (
  email      TEXT        PRIMARY KEY,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note       TEXT
);

ALTER TABLE founder_accounts ENABLE ROW LEVEL SECURITY;

-- Deny all direct access via PostgREST / client SDKs.
-- The table is only ever touched by migrations or the service-role key.
CREATE POLICY "founder_accounts_deny_all"
  ON founder_accounts
  FOR ALL
  USING (false);

INSERT INTO founder_accounts (email, note)
VALUES ('0mnaarkar2673@gmail.com', 'Platform founder')
ON CONFLICT (email) DO NOTHING;
