/**
 * WhatsApp Cloud API helpers.
 * Uses Meta's free WhatsApp Cloud API (free for first 1000 conversations/month).
 */

import { createServiceClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const GRAPH = "https://graph.facebook.com/v18.0";

// ── Transport: timeout + bounded retry ───────────────────────────────────────
// Sends had neither, so a hung Meta connection held a serverless function until
// its maxDuration and a single transient blip lost the message permanently.
const GRAPH_TIMEOUT_MS = 8_000;
const GRAPH_MAX_ATTEMPTS = 3;              // 1 initial + 2 retries
const GRAPH_BACKOFF_MS = [400, 1_200];     // between attempts
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST to the Graph API with a per-attempt timeout and bounded retries.
 *
 * Retries ONLY transient conditions — network failure, timeout, 429 and 5xx.
 * A 4xx is a permanent Meta verdict (invalid token, invalid recipient, policy
 * or template violation, malformed body) and is returned immediately; retrying
 * it would waste the window and could trip rate limits.
 *
 * Retrying happens entirely inside this function, before any caller writes a
 * message row, so a retry can never produce a duplicate application record.
 * A successful HTTP response is never retried.
 *
 * Logs attempt number, status, elapsed ms and Meta's error code only — never a
 * token, Authorization header, phone number, message body or template parameter.
 */
async function graphPost(
  url: string,
  accessToken: string,
  body: unknown,
  label: string,
): Promise<{ res: Response; text: string; attempts: number; elapsedMs: number }> {
  const started = Date.now();
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= GRAPH_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text();

      if (res.ok || !RETRYABLE_STATUS.has(res.status)) {
        if (!res.ok) {
          let code: unknown;
          try { code = (JSON.parse(text) as { error?: { code?: number } })?.error?.code; } catch { /* non-JSON */ }
          console.warn(`[wa-graph] ${label} permanent failure attempt=${attempt} status=${res.status} code=${code ?? "?"} elapsed_ms=${Date.now() - started}`);
        }
        return { res, text, attempts: attempt, elapsedMs: Date.now() - started };
      }

      // Retryable status.
      lastErr = new Error(`HTTP ${res.status}`);
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5_000)
        : GRAPH_BACKOFF_MS[attempt - 1] ?? 1_200;
      console.warn(`[wa-graph] ${label} transient status=${res.status} attempt=${attempt}/${GRAPH_MAX_ATTEMPTS} elapsed_ms=${Date.now() - t0} retrying_in_ms=${attempt < GRAPH_MAX_ATTEMPTS ? wait : 0}`);
      if (attempt === GRAPH_MAX_ATTEMPTS) return { res, text, attempts: attempt, elapsedMs: Date.now() - started };
      await sleep(wait);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const aborted = (err as { name?: string })?.name === "AbortError";
      const wait = GRAPH_BACKOFF_MS[attempt - 1] ?? 1_200;
      console.warn(`[wa-graph] ${label} ${aborted ? "timeout" : "network error"} attempt=${attempt}/${GRAPH_MAX_ATTEMPTS} elapsed_ms=${Date.now() - t0} retrying_in_ms=${attempt < GRAPH_MAX_ATTEMPTS ? wait : 0}`);
      if (attempt === GRAPH_MAX_ATTEMPTS) break;
      await sleep(wait);
    }
  }

  const aborted = (lastErr as { name?: string })?.name === "AbortError";
  throw new Error(
    `${label} failed after ${GRAPH_MAX_ATTEMPTS} attempts in ${Date.now() - started}ms: ` +
    (aborted ? `timeout after ${GRAPH_TIMEOUT_MS}ms per attempt` : String((lastErr as Error)?.message ?? lastErr)),
  );
}

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
  // graph_ms / cfg_ms are instrumentation only. Existing callers that destructure
  // just provider_message_id are unaffected.
): Promise<{ provider_message_id: string; graph_ms?: number; cfg_ms?: number }> {
  // Instrumentation: tCfg measures config load (DB round-trip unless cached),
  // tGraph measures the Meta Graph API call in isolation. No PII is logged —
  // never token fragments, never the recipient's phone number.
  const tCfgStart = Date.now();
  const config = await loadWhatsAppConfig(orgId);
  const cfgMs = Date.now() - tCfgStart;
  const rawToken = decryptSecret(config.access_token_enc);

  const tGraphStart = Date.now();
  const { res, text: rawBody, attempts } = await graphPost(
    `${GRAPH}/${config.phone_number_id}/messages`,
    rawToken,
    {
      messaging_product: "whatsapp",
      recipient_type:    "individual",
      to:                recipientPhone,
      type:              "text",
      text:              { body: text },
    },
    "text-send",
  );

  const graphMs = Date.now() - tGraphStart;

  if (!res.ok) {
    const errBody = rawBody;
    // Log the HTTP status + full error body so it appears in Vercel logs
    console.error(`[wa-send] META SEND FAILED org=${orgId} phoneNumberId="${config.phone_number_id}" http_status=${res.status} attempts=${attempts} error_body=${errBody}`);
    console.log(`[wa-timing] stage=graph_send org=${orgId} ok=false cfg_ms=${cfgMs} cfg_cached=${cfgMs < 5} graph_ms=${graphMs} attempts=${attempts}`);
    // Unchanged error shape: callers key off "WhatsApp send failed: <meta body>".
    throw new Error(`WhatsApp send failed: ${errBody}`);
  }
  const data = JSON.parse(rawBody) as { messages: Array<{ id: string }> };
  console.log(`[wa-send] META SEND OK org=${orgId} provider_message_id="${data.messages?.[0]?.id ?? ""}"`);
  console.log(`[wa-timing] stage=graph_send org=${orgId} ok=true cfg_ms=${cfgMs} cfg_cached=${cfgMs < 5} graph_ms=${graphMs}`);
  return { provider_message_id: data.messages?.[0]?.id ?? "", graph_ms: graphMs, cfg_ms: cfgMs };
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

  const { res, text: rawBody, attempts } = await graphPost(
    `${GRAPH}/${config.phone_number_id}/messages`,
    decryptSecret(config.access_token_enc),
    body,
    "template-send",
  );

  if (!res.ok) {
    // Template name and language are safe to log; parameter values are not.
    console.error(`[wa-send] TEMPLATE SEND FAILED org=${orgId} template=${templateName} lang=${languageCode} http_status=${res.status} attempts=${attempts}`);
    // Unchanged error shape: callers key off "WhatsApp template send failed: <meta body>".
    throw new Error(`WhatsApp template send failed: ${rawBody}`);
  }
  const data = JSON.parse(rawBody) as { messages: Array<{ id: string }> };
  return { provider_message_id: data.messages?.[0]?.id ?? "" };
}

// ── Validate token by fetching phone number info ──────────────────────────────

/**
 * Validate a WhatsApp configuration before it is saved.
 *
 * A valid token alone is NOT enough. This previously accepted a WABA id in the
 * phone_number_id field: Graph answers 200 for a WABA node but simply omits
 * `display_phone_number`, the old code read that as success, and the fallback
 * chain then stored the WABA id as the display number. Production ran with the
 * two ids swapped until it was caught by hand.
 *
 * Checks, all fail-closed:
 *   1. the node is readable with this token
 *   2. it echoes back the id we asked for
 *   3. it exposes display_phone_number — only a phone-number node does
 *   4. when a WABA id is supplied, the phone actually belongs to that WABA
 *
 * The token is never logged and never appears in a returned error.
 */
export async function validateWhatsAppToken(
  phoneNumberId: string,
  accessToken:   string,
  wabaId?:       string,
): Promise<{ valid: boolean; display_phone_number?: string; verified_name?: string; error?: string }> {
  const authed = (url: string) => fetch(url, { headers: { "Authorization": `Bearer ${accessToken}` } });

  let res: Response;
  try {
    res = await authed(`${GRAPH}/${phoneNumberId}?fields=id,display_phone_number,verified_name`);
  } catch {
    return { valid: false, error: "Could not reach Meta to validate the phone number ID." };
  }

  if (!res.ok) {
    let msg = "Invalid token or phone number ID.";
    try {
      const err = await res.json() as { error?: { message?: string } };
      if (err.error?.message) msg = err.error.message;
    } catch { /* keep the generic message */ }
    // Meta's message never contains our token; it is safe to surface.
    return { valid: false, error: msg };
  }

  let data: { id?: string; display_phone_number?: string; verified_name?: string };
  try {
    data = await res.json();
  } catch {
    return { valid: false, error: "Unreadable response from Meta — refusing to save." };
  }

  if (data.id && String(data.id) !== String(phoneNumberId)) {
    return { valid: false, error: "Meta returned a different object than the ID provided — refusing to save." };
  }

  if (!data.display_phone_number) {
    // This is the WABA-in-the-phone-field case.
    return {
      valid: false,
      error: "That ID is not a WhatsApp phone number — it looks like a WhatsApp Business Account (WABA) ID. "
           + "Use the Phone Number ID from WhatsApp Manager › API Setup.",
    };
  }

  if (wabaId) {
    try {
      const listRes = await authed(`${GRAPH}/${wabaId}/phone_numbers?fields=id`);
      if (!listRes.ok) {
        return { valid: false, error: "Could not read phone numbers for that WABA ID — check the WABA ID and the token's asset access." };
      }
      const list = await listRes.json() as { data?: Array<{ id?: string }> };
      const ids = (list.data ?? []).map((n) => String(n.id));
      if (!ids.length) {
        return { valid: false, error: "That WABA has no phone numbers visible to this token — refusing to save." };
      }
      if (!ids.includes(String(phoneNumberId))) {
        return { valid: false, error: "That phone number does not belong to the WABA ID provided — check both IDs." };
      }
    } catch {
      return { valid: false, error: "Could not verify the phone number belongs to that WABA — refusing to save." };
    }
  }

  return {
    valid: true,
    display_phone_number: data.display_phone_number,
    verified_name: data.verified_name,
  };
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
