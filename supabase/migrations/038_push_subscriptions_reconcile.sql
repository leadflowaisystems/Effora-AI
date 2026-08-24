-- 038_push_subscriptions_reconcile.sql
--
-- user_push_subscriptions is declared TWICE, with different shapes:
--   010_cockpit.sql    → UNIQUE (org_id, user_id, endpoint), no updated_at
--   011_completion.sql → UNIQUE (endpoint),                  has updated_at
--
-- Both use CREATE TABLE IF NOT EXISTS, so whichever migration ran first won and
-- the second was a silent no-op. app/api/orgs/[orgId]/push-subscribe/route.ts
-- upserts with onConflict:"endpoint" AND writes updated_at — both of which only
-- exist in the 011 shape. On a database where 010 landed first, every push
-- subscription save fails and owner notifications silently never arrive.
--
-- This migration reconciles either starting shape to the one the code expects.
-- Idempotent and safe to re-run.

-- 1. Ensure updated_at exists.
ALTER TABLE user_push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Collapse duplicate endpoints before adding the unique constraint.
--    Keeps the most recently created row per endpoint.
DELETE FROM user_push_subscriptions a
USING user_push_subscriptions b
WHERE a.endpoint = b.endpoint
  AND a.created_at < b.created_at;

-- 3. Drop the 010-shape composite constraint if present.
ALTER TABLE user_push_subscriptions
  DROP CONSTRAINT IF EXISTS user_push_subscriptions_org_id_user_id_endpoint_key;

-- 4. Ensure the lone-endpoint unique constraint the upsert targets.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_push_subscriptions_endpoint_key'
  ) THEN
    ALTER TABLE user_push_subscriptions
      ADD CONSTRAINT user_push_subscriptions_endpoint_key UNIQUE (endpoint);
  END IF;
END $$;
