-- 037_founder_account_correction.sql
--
-- Migration 034 seeded founder_accounts with '0mnaarkar2673@gmail.com'
-- (leading DIGIT ZERO, "2673"). The address actually used to log in to Effora
-- is 'omnaarkar7@gmail.com' (leading LETTER o, "7"). Those are different
-- strings, so lib/founder-guard.ts would never match the real login via the
-- founder_accounts fallback.
--
-- This migration adds the correct address. It is idempotent and safe to re-run.
--
-- Emails are stored lowercase because lib/founder-guard.ts lowercases the
-- session email before comparing.

INSERT INTO founder_accounts (email, note)
VALUES ('omnaarkar7@gmail.com', 'Platform founder — primary login')
ON CONFLICT (email) DO NOTHING;

-- Guard against future mixed-case rows silently failing to match.
-- (founder_accounts.email is plain TEXT, not citext.)
ALTER TABLE founder_accounts
  DROP CONSTRAINT IF EXISTS founder_accounts_email_lowercase;

ALTER TABLE founder_accounts
  ADD CONSTRAINT founder_accounts_email_lowercase
  CHECK (email = lower(email));

-- ── OPTIONAL CLEANUP — review before running ────────────────────────────────
-- '0mnaarkar2673@gmail.com' from migration 034 is left in place deliberately.
-- If it is a typo and NOT a real account you sign in with, delete it:
--
--   DELETE FROM founder_accounts WHERE email = '0mnaarkar2673@gmail.com';
--
-- Leaving it costs nothing; deleting a real account would remove founder access.
