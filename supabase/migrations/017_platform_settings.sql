-- Migration 017: Platform-level settings table
-- Admin access is enforced at the API layer via isAdminEmail() — no DB user_profiles needed.

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

-- RLS: service role only (API routes use service role client; admin check is done in route handler)
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_settings_service_only ON platform_settings
  USING (auth.role() = 'service_role');

-- meta_byo provider: integrations.provider = 'meta_byo' stores per-org Meta App override
-- No schema change needed — uses existing integrations table with a new provider value.
