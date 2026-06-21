-- 036_payment_mode.sql
-- Add payment_mode preference to orgs.
-- Controls whether an org uses Razorpay only, UPI only, or both.
-- Existing orgs default to 'both' — no behaviour change.

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS payment_mode TEXT;

UPDATE orgs
  SET payment_mode = 'both'
  WHERE payment_mode IS NULL;

ALTER TABLE orgs
  ALTER COLUMN payment_mode SET DEFAULT 'both';

ALTER TABLE orgs
  ALTER COLUMN payment_mode SET NOT NULL;

ALTER TABLE orgs
  DROP CONSTRAINT IF EXISTS orgs_payment_mode_check;

ALTER TABLE orgs
  ADD CONSTRAINT orgs_payment_mode_check
  CHECK (payment_mode IN ('razorpay_only', 'upi_only', 'both'));
