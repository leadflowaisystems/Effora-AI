-- Migration 017: Platform-level settings table + is_platform_admin flag

CREATE TABLE IF NOT EXISTS platform_settings (
  id                          integer PRIMARY KEY DEFAULT 1,
  meta_app_id                 text,
  meta_app_secret_encrypted   text,
  meta_webhook_verify_token   text,
  meta_app_mode               text DEFAULT 'dev',
  last_verified_at            timestamptz,
  updated_at                  timestamptz DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id),
  CONSTRAINT single_row CHECK (id = 1)
);

-- RLS: only platform admins or service role can read/write
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_settings_admin_only ON platform_settings
  USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.uid() IN (
      SELECT user_id FROM user_profiles WHERE is_platform_admin = true
    )
  );

-- Add is_platform_admin flag to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_platform_admin boolean DEFAULT false;

-- Add meta_byo provider support (no schema change, just comment for clarity)
-- integrations.provider = 'meta_byo' stores per-org Meta App override

-- Seed Om as platform admin (update email to match actual signup email)
UPDATE user_profiles
SET is_platform_admin = true
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = '0mnaarkar2673@gmail.com'
);
