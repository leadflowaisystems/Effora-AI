-- 038_message_status_and_idempotency.sql
--
-- Two changes, both required before WhatsApp can be trusted with real customers.
--
-- 1. DELIVERY STATUS
--    Meta sends sent/delivered/read/failed callbacks for every outbound message.
--    They were being discarded, so there was no way to tell whether a customer
--    ever received a payment link or a booking reminder. `status` records the
--    furthest state reached, `status_updated_at` when it was last advanced, and
--    `failure_reason` a short non-sensitive description for failures.
--
--    Existing rows are left NULL on purpose: NULL means "never observed", which
--    is honest. Back-filling them to 'sent' would invent delivery evidence we do
--    not have. New rows are also written without a status -- the send paths are
--    untouched in this phase -- so a message stays NULL until Meta's first
--    callback advances it. 'pending' is allowed by the CHECK so a later phase can
--    set it at insert time without another migration.
--
-- 2. INBOUND IDEMPOTENCY
--    Meta retries a webhook whenever it does not get a timely 200, and inbound
--    messages stored the wamid only in metadata, so a retry created a duplicate
--    message, a duplicate whatsapp.message_received event and a duplicate AI
--    reply. provider_message_id now carries the wamid and a unique index makes a
--    second insert impossible rather than merely unlikely.
--
--    The index is (org_id, provider_message_id), org-scoped so two tenants can
--    never collide with each other. It is deliberately NOT a partial index:
--    Postgres already treats NULLs as distinct, so the 359 existing rows with a
--    NULL provider_message_id are unaffected, and a plain index can serve as an
--    ON CONFLICT arbiter (a partial one cannot, without repeating its predicate).
--
-- Safety: verified against production before writing this migration --
--   messages 521; provider_message_id set 162, NULL 359
--   duplicate provider_message_id (global)          0
--   duplicate (org_id, provider_message_id) pairs   0
--   duplicate (org_id, metadata.wamid) inbound WA   0
--   collisions if metadata.wamid were backfilled    0
-- The unique index can therefore be created without any data cleanup.
--
-- Catalog-only for the columns (ADD COLUMN with no default rewrites nothing).
-- The index build takes a brief ACCESS SHARE-blocking lock on a 521-row table.
-- Idempotent: safe to run more than once.

-- ── 1. Delivery status ──────────────────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status            TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS failure_reason    TEXT;

-- Allowed values. NULL stays legal so historical rows remain valid.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_status_check'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_status_check
      CHECK (status IS NULL OR status IN ('pending','sent','delivered','read','failed'));
  END IF;
END $$;

COMMENT ON COLUMN messages.status IS
  'Furthest delivery state observed from the provider: pending < sent < delivered < read, plus failed. '
  'NULL means no status was ever observed (all rows predating migration 038).';
COMMENT ON COLUMN messages.status_updated_at IS
  'When status last advanced. Only moves forward -- see the rank guard in the WhatsApp webhook.';
COMMENT ON COLUMN messages.failure_reason IS
  'Short provider failure description for status=failed. Never contains tokens, secrets or message content.';

-- ── 2. Inbound idempotency ──────────────────────────────────────────────────
-- Org-scoped so one tenant's provider id can never collide with another's.
-- NULLs are distinct in Postgres, so rows without a provider id are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_org_provider_message_id
  ON messages (org_id, provider_message_id);

-- Status callbacks arrive keyed only by wamid; this keeps that lookup cheap.
CREATE INDEX IF NOT EXISTS idx_messages_provider_message_id
  ON messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
