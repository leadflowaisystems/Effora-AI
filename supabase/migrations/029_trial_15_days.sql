-- 029_trial_15_days.sql
-- Change trial duration default from 14 days to 15 days.
-- Existing orgs already in trial are NOT changed (their trial_ends_at was set at signup).
-- Only new orgs created after this migration will get a 15-day trial.

ALTER TABLE orgs
  ALTER COLUMN trial_ends_at
  SET DEFAULT (NOW() + INTERVAL '15 days');
