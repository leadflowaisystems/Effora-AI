-- 035_orgs_updated_at.sql
-- Add updated_at to the orgs table.
-- This column was omitted from every prior migration but is required by
-- the upi-id route and general auditing.
--
-- Pattern: nullable first → backfill → add default → set NOT NULL
-- This avoids any implicit NOW() writes to existing rows during ALTER.

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE orgs
  SET updated_at = created_at
  WHERE updated_at IS NULL;

ALTER TABLE orgs
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE orgs
  ALTER COLUMN updated_at SET NOT NULL;
