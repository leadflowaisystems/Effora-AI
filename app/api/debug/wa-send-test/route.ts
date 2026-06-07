/**
 * GET /api/debug/wa-send-test?orgId=<orgId>
 *
 * Temporary diagnostic endpoint — REMOVE after debugging is complete.
 *
 * Loads the exact WhatsApp config used by wa-send, decrypts the token,
 * returns a safe fingerprint, then makes the two Meta API calls that
 * identify whether the token is valid and has permission to send.
 *
 * Never returns the full token — only prefix, suffix, and length.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient }       from "@/lib/supabase/server";
import { decryptSecret, isEncrypted } from "@/lib/crypto";

// MUST match the version used by lib/integrations/whatsapp-cloud.ts
const GRAPH_SEND = "https://graph.facebook.com/v18.0";
// Also test with current version to show any version-related difference
const GRAPH_CURRENT = "https://graph.facebook.com/v23.0";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId query param required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // ── 1. Load the EXACT config that loadWhatsAppConfig() would use ─────────────
  // This replicates the internal loadWhatsAppConfig() logic verbatim —
  // including the provider filter — so there is zero ambiguity.
  const { data: row, error: dbErr } = await svc
    .from("integrations")
    .select("id, active, config, created_at, updated_at")
    .eq("org_id", orgId)
    .eq("provider", "whatsapp_cloud")
    .single();

  if (dbErr || !row) {
    return NextResponse.json({
      error: "No whatsapp_cloud integration row found",
      db_error: dbErr?.message ?? null,
      org_id: orgId,
    }, { status: 404 });
  }

  const cfg = (row.config ?? {}) as Record<string, string>;
  const { phone_number_id, waba_id, display_phone_number, access_token_enc } = cfg;

  // ── 2. Decrypt the token using the SAME code path as sendWhatsAppMessage ─────
  let rawToken: string | null = null;
  let decryptError: string | null = null;
  let encFormat: string | null = null;

  if (access_token_enc) {
    const parts = access_token_enc.split(":");
    encFormat = `${parts.length} segments (expected 3 for AES-256-GCM)`;
    const looksEncrypted = isEncrypted(access_token_enc);
    if (!looksEncrypted) {
      // Stored as plaintext — decryptSecret will throw "Invalid encrypted value format"
      encFormat += " — NOT encrypted (isEncrypted=false)";
    }
    try {
      rawToken = decryptSecret(access_token_enc);
    } catch (e) {
      decryptError = e instanceof Error ? e.message : String(e);
    }
  }

  // Safe fingerprint only — never expose the full token
  const tokenFingerprint = rawToken ? {
    tokenPrefix: rawToken.slice(0, 12),
    tokenSuffix: rawToken.slice(-8),
    tokenLength: rawToken.length,
    phoneNumberId: phone_number_id ?? null,
    wabaId: waba_id ?? null,
  } : null;

  if (!rawToken) {
    return NextResponse.json({
      org_id: orgId,
      integration_active: row.active,
      integration_created_at: row.created_at,
      integration_updated_at: row.updated_at,
      stored_phone_number_id: phone_number_id ?? null,
      stored_waba_id: waba_id ?? null,
      stored_display_phone: display_phone_number ?? null,
      enc_format: encFormat,
      decrypt_error: decryptError,
      token_fingerprint: null,
      diagnosis: decryptError
        ? `DECRYPT_FAILED: ${decryptError}. The ENCRYPTION_KEY in Vercel may differ from when the token was saved.`
        : "NO_TOKEN: access_token_enc is missing from stored config.",
    });
  }

  // ── 3. GET /me — basic token validity check (same as wa-send path would use) ─
  const [meV18, meV23] = await Promise.all([
    fetch(`${GRAPH_SEND}/me`, {
      headers: { "Authorization": `Bearer ${rawToken}` },
    }).then(async (r) => ({ status: r.status, body: await r.json() })).catch((e) => ({ status: -1, error: String(e) })),
    fetch(`${GRAPH_CURRENT}/me`, {
      headers: { "Authorization": `Bearer ${rawToken}` },
    }).then(async (r) => ({ status: r.status, body: await r.json() })).catch((e) => ({ status: -1, error: String(e) })),
  ]);

  // ── 4. GET /{phone_number_id} — the exact call wa-send makes before messaging ─
  const [phoneCheckV18, phoneCheckV23] = await Promise.all([
    phone_number_id
      ? fetch(`${GRAPH_SEND}/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,status`, {
          headers: { "Authorization": `Bearer ${rawToken}` },
        }).then(async (r) => ({ status: r.status, body: await r.json() })).catch((e) => ({ status: -1, error: String(e) }))
      : Promise.resolve({ status: null, body: null }),
    phone_number_id
      ? fetch(`${GRAPH_CURRENT}/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,status`, {
          headers: { "Authorization": `Bearer ${rawToken}` },
        }).then(async (r) => ({ status: r.status, body: await r.json() })).catch((e) => ({ status: -1, error: String(e) }))
      : Promise.resolve({ status: null, body: null }),
  ]);

  // ── 5. Determine diagnosis ────────────────────────────────────────────────────
  const meOkV18    = meV18.status === 200;
  const meOkV23    = meV23.status === 200;
  const phoneOkV18 = phoneCheckV18.status === 200;
  const phoneOkV23 = phoneCheckV23.status === 200;

  let diagnosis: string;
  if (!meOkV18 && !meOkV23) {
    const errCode = (meV18 as { body?: { error?: { code?: number; message?: string } } })?.body?.error?.code;
    if (errCode === 190) {
      diagnosis = "TOKEN_INVALID_190: Meta confirmed the token is expired or revoked (OAuthException code 190). Must generate a new System User permanent token in Meta Business Manager and reconnect in Settings.";
    } else {
      diagnosis = `TOKEN_REJECTED_BOTH_VERSIONS: v18.0 HTTP ${meV18.status}, v23.0 HTTP ${meV23.status}. Token may be invalid or wrong type.`;
    }
  } else if (!meOkV18 && meOkV23) {
    diagnosis = "API_VERSION_SUNSET: Token works on v23.0 but FAILS on v18.0 (the version used by wa-send). v18.0 was released Oct 2023 and its 2-year support window ended ~Oct 2025. wa-send must be updated to use v23.0.";
  } else if (meOkV18 && !phoneOkV18) {
    const errCode = (phoneCheckV18 as { body?: { error?: { code?: number; message?: string } } })?.body?.error?.code;
    if (errCode === 131005) {
      diagnosis = `PHONE_NUMBER_PERMISSION_131005: Token is valid (/me returned 200) but lacks permission for phone_number_id=${phone_number_id}. The System User token may not have been granted access to this phone number in Meta Business Manager, or the phone_number_id stored is wrong.`;
    } else {
      diagnosis = `PHONE_NUMBER_REJECTED_V18: Token valid but phone_number_id check failed on v18.0 (HTTP ${phoneCheckV18.status}). Error: ${JSON.stringify((phoneCheckV18 as { body?: unknown })?.body)}`;
    }
  } else if (meOkV18 && phoneOkV18) {
    diagnosis = "ALL_OK_V18: Token is valid on v18.0 AND phone_number_id is accessible. If sends still fail, the issue is not credential-related — check Vercel logs for the exact error body returned by Meta during the send attempt.";
  } else {
    diagnosis = `PARTIAL: me_v18=${meV18.status} me_v23=${meV23.status} phone_v18=${phoneCheckV18.status} phone_v23=${phoneCheckV23.status}`;
  }

  return NextResponse.json({
    org_id: orgId,
    integration_active: row.active,
    integration_created_at: row.created_at,
    integration_updated_at: row.updated_at,
    stored_phone_number_id: phone_number_id ?? null,
    stored_waba_id: waba_id ?? null,
    stored_display_phone: display_phone_number ?? null,
    enc_format: encFormat,
    decrypt_error: null,
    token_fingerprint: tokenFingerprint,

    // /me checks — token validity
    me_v18:    { status: meV18.status,    body: (meV18 as { body?: unknown }).body ?? null },
    me_v23:    { status: meV23.status,    body: (meV23 as { body?: unknown }).body ?? null },

    // Phone number ID checks — permission to send
    phone_check_v18: { status: phoneCheckV18.status, body: (phoneCheckV18 as { body?: unknown }).body ?? null },
    phone_check_v23: { status: phoneCheckV23.status, body: (phoneCheckV23 as { body?: unknown }).body ?? null },

    graph_version_used_by_wa_send:    "v18.0",
    graph_version_current:            "v23.0",

    diagnosis,
  });
}
