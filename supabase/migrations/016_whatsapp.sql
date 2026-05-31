-- Migration 016: WhatsApp Cloud API support
-- Adds whatsapp_cloud as a recognized channel/provider.
-- No schema changes needed — uses existing integrations + conversations + leads tables.
-- channel_provider = 'whatsapp_cloud' and leads.channel = 'whatsapp_cloud'

-- Ensure conversations table has channel_provider column (added in 015, but defensive)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_provider text;

-- Index for fast lookup of WA integrations by phone_number_id (stored in config jsonb)
-- Used in webhook handler to find org from incoming phone_number_id
CREATE INDEX IF NOT EXISTS idx_integrations_whatsapp_cloud
  ON integrations (provider)
  WHERE provider = 'whatsapp_cloud';

-- Index for WA leads lookup
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_cloud
  ON leads (org_id, channel, external_id)
  WHERE channel = 'whatsapp_cloud';
