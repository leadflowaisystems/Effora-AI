/**
 * WhatsApp Cloud API helpers.
 * Uses Meta's free WhatsApp Cloud API (free for first 1000 conversations/month).
 */

import { createServiceClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const GRAPH = "https://graph.facebook.com/v18.0";

export interface WhatsAppConfig {
  waba_id:              string;
  phone_number_id:      string;
  access_token_enc:     string;
  display_phone_number: string;
}

// ── Send message ─────────────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  orgId:          string,
  recipientPhone: string,
  text:           string,
): Promise<{ provider_message_id: string }> {
  const config = await loadWhatsAppConfig(orgId);

  const res = await fetch(`${GRAPH}/${config.phone_number_id}/messages`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${decryptSecret(config.access_token_enc)}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type:    "individual",
      to:                recipientPhone,
      type:              "text",
      text:              { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp send failed: ${err}`);
  }
  const data = await res.json() as { messages: Array<{ id: string }> };
  return { provider_message_id: data.messages?.[0]?.id ?? "" };
}

// ── Send template message (approved Meta template, works outside 24h window) ─

export async function sendWhatsAppTemplate(
  orgId:          string,
  recipientPhone: string,
  templateName:   string,
  languageCode:   string = "en",
  components?:    Array<{ type: string; parameters: Array<{ type: string; text: string }> }>,
): Promise<{ provider_message_id: string }> {
  const config = await loadWhatsAppConfig(orgId);

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                recipientPhone,
    type:              "template",
    template: {
      name:     templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  };

  const res = await fetch(`${GRAPH}/${config.phone_number_id}/messages`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${decryptSecret(config.access_token_enc)}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp template send failed: ${err}`);
  }
  const data = await res.json() as { messages: Array<{ id: string }> };
  return { provider_message_id: data.messages?.[0]?.id ?? "" };
}

// ── Validate token by fetching phone number info ──────────────────────────────

export async function validateWhatsAppToken(
  phoneNumberId: string,
  accessToken:   string,
): Promise<{ valid: boolean; display_phone_number?: string; error?: string }> {
  const res = await fetch(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json() as { error?: { message: string } };
    return { valid: false, error: err.error?.message ?? "Invalid token or phone number ID" };
  }
  const data = await res.json() as { display_phone_number: string };
  return { valid: true, display_phone_number: data.display_phone_number };
}

// ── Save integration ──────────────────────────────────────────────────────────

export async function saveWhatsAppIntegration(
  orgId:             string,
  wabaId:            string,
  phoneNumberId:     string,
  rawAccessToken:    string,
  displayPhone:      string,
): Promise<void> {
  const svc = createServiceClient();
  const config = {
    waba_id:              wabaId,
    phone_number_id:      phoneNumberId,
    access_token_enc:     encryptSecret(rawAccessToken),
    display_phone_number: displayPhone,
  } as Record<string, string>;

  const { data: existing } = await svc
    .from("integrations")
    .select("id")
    .eq("org_id", orgId)
    .eq("provider", "whatsapp_cloud")
    .maybeSingle();

  if (existing) {
    await svc.from("integrations")
      .update({ config, active: true, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id);
  } else {
    await svc.from("integrations").insert({
      org_id:   orgId,
      provider: "whatsapp_cloud",
      config,
      active:   true,
    });
  }
  // Clear cached config so the next send picks up the new token
  invalidateWhatsAppConfigCache(orgId);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// Module-level config cache — avoids a DB round-trip on every sendWhatsAppMessage call.
// TTL: 5 minutes. Invalidated automatically when saveWhatsAppIntegration runs.
const WA_CONFIG_CACHE = new Map<string, { config: WhatsAppConfig; expiresAt: number }>();
const WA_CONFIG_TTL_MS = 5 * 60_000;

/** Call this whenever the integration is saved/updated to clear the stale cache entry. */
export function invalidateWhatsAppConfigCache(orgId: string): void {
  WA_CONFIG_CACHE.delete(orgId);
}

async function loadWhatsAppConfig(orgId: string): Promise<WhatsAppConfig> {
  const cached = WA_CONFIG_CACHE.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("integrations")
    .select("config, active")
    .eq("org_id", orgId)
    .eq("provider", "whatsapp_cloud")
    .single();

  if (error || !data?.active) {
    throw new Error(`No active WhatsApp Cloud integration for org ${orgId}`);
  }
  const config = data.config as unknown as WhatsAppConfig;
  WA_CONFIG_CACHE.set(orgId, { config, expiresAt: Date.now() + WA_CONFIG_TTL_MS });
  return config;
}
