/**
 * GET /api/debug/wa-creds?orgId=<orgId>
 *
 * Temporary diagnostic — REMOVE after debugging is complete.
 *
 * Audits the WhatsApp Cloud integration credentials stored for an org:
 *   1. Reads the whatsapp_cloud row from integrations table
 *   2. Decrypts the access_token_enc
 *   3. Calls Meta debug_token API to check validity, expiry, issuing app
 *   4. Calls GET /{phone_number_id} to verify the stored Phone Number ID
 *   5. Calls GET /{waba_id} to verify the stored WABA ID
 *   6. Cross-checks all fields for mismatches
 *
 * Reports exact failure reason for OAuthException code 190.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient }       from "@/lib/supabase/server";
import { decryptSecret }             from "@/lib/crypto";

const GRAPH = "https://graph.facebook.com/v18.0";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const orgId     = req.nextUrl.searchParams.get("orgId");
  const appId     = process.env.META_APP_ID     ?? null;
  const appSecret = process.env.META_APP_SECRET ?? null;

  if (!orgId) {
    return NextResponse.json({ error: "orgId query param required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // ── 1. Fetch the integration row ─────────────────────────────────────────
  const { data: row, error: dbErr } = await svc
    .from("integrations")
    .select("id, org_id, active, created_at, updated_at, config")
    .eq("org_id", orgId)
    .eq("provider", "whatsapp_cloud")
    .maybeSingle();

  if (dbErr) {
    return NextResponse.json({ error: "DB error", detail: dbErr.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({
      found: false,
      org_id: orgId,
      message: "No whatsapp_cloud integration row exists for this org.",
    });
  }

  const cfg = (row.config ?? {}) as Record<string, string>;

  const storedPhoneNumberId     = cfg.phone_number_id      ?? null;
  const storedWabaId            = cfg.waba_id              ?? null;
  const storedDisplayPhone      = cfg.display_phone_number ?? null;
  const accessTokenEnc          = cfg.access_token_enc     ?? null;

  // ── 2. Decrypt the access token ──────────────────────────────────────────
  let accessToken: string | null = null;
  let decryptError: string | null = null;

  if (accessTokenEnc) {
    try {
      accessToken = decryptSecret(accessTokenEnc);
    } catch (e) {
      decryptError = e instanceof Error ? e.message : String(e);
    }
  }

  const tokenPreview = accessToken
    ? `${accessToken.slice(0, 10)}...${accessToken.slice(-6)} (len=${accessToken.length})`
    : null;

  // ── 3. Call Meta debug_token to audit the token ──────────────────────────
  let debugTokenResult: Record<string, unknown> | null = null;
  let debugTokenError:  string | null = null;

  if (accessToken && appId && appSecret) {
    const appAccessToken = `${appId}|${appSecret}`;
    try {
      const url = new URL(`${GRAPH}/debug_token`);
      url.searchParams.set("input_token",  accessToken);
      url.searchParams.set("access_token", appAccessToken);
      const res  = await fetch(url.toString());
      const json = await res.json() as Record<string, unknown>;
      const data  = json.data  as {
        app_id?: string; is_valid?: boolean; type?: string; application?: string;
        expires_at?: number; issued_at?: number; scopes?: string[];
        error?: { code?: number; message?: string; subcode?: number };
        user_id?: string;
      } | undefined;
      const err   = json.error as { code?: number; message?: string } | undefined;

      const expiresAt  = data?.expires_at  ? new Date(data.expires_at  * 1000).toISOString() : null;
      const issuedAt   = data?.issued_at   ? new Date(data.issued_at   * 1000).toISOString() : null;
      const nowEpoch   = Math.floor(Date.now() / 1000);
      const isExpired  = data?.expires_at ? data.expires_at < nowEpoch : null;

      debugTokenResult = {
        is_valid:          data?.is_valid   ?? null,
        is_expired:        isExpired,
        token_type:        data?.type       ?? null,
        application:       data?.application ?? null,
        issued_by_app_id:  data?.app_id     ?? null,
        matches_env_app:   data?.app_id === appId,
        expires_at_iso:    expiresAt,
        issued_at_iso:     issuedAt,
        scopes:            data?.scopes     ?? null,
        user_id:           data?.user_id    ?? null,
        token_error:       data?.error      ?? null,
        meta_api_error:    err              ?? null,
        raw:               json,
      };
    } catch (e) {
      debugTokenError = e instanceof Error ? e.message : String(e);
    }
  } else if (!appId || !appSecret) {
    debugTokenError = "META_APP_ID or META_APP_SECRET not set in env — cannot call debug_token";
  }

  // ── 4. Verify Phone Number ID with the stored token ──────────────────────
  let phoneNumberIdCheck: Record<string, unknown> | null = null;
  let phoneNumberIdError: string | null = null;

  if (accessToken && storedPhoneNumberId) {
    try {
      const res  = await fetch(
        `${GRAPH}/${storedPhoneNumberId}?fields=display_phone_number,verified_name,quality_rating,status`,
        { headers: { "Authorization": `Bearer ${accessToken}` } },
      );
      const json = await res.json() as Record<string, unknown>;
      const err  = json.error as { code?: number; message?: string; type?: string; fbtrace_id?: string } | undefined;
      phoneNumberIdCheck = {
        http_status:          res.status,
        display_phone_number: (json as Record<string, string>).display_phone_number ?? null,
        verified_name:        (json as Record<string, string>).verified_name        ?? null,
        quality_rating:       (json as Record<string, string>).quality_rating       ?? null,
        status:               (json as Record<string, string>).status               ?? null,
        matches_stored_display: (json as Record<string, string>).display_phone_number === storedDisplayPhone,
        meta_error:           err  ?? null,
        raw:                  json,
      };
    } catch (e) {
      phoneNumberIdError = e instanceof Error ? e.message : String(e);
    }
  }

  // ── 5. Verify WABA ID with the stored token ───────────────────────────────
  let wabaCheck: Record<string, unknown> | null = null;
  let wabaCheckError: string | null = null;

  if (accessToken && storedWabaId) {
    try {
      const res  = await fetch(
        `${GRAPH}/${storedWabaId}?fields=name,currency,message_template_namespace,account_review_status`,
        { headers: { "Authorization": `Bearer ${accessToken}` } },
      );
      const json = await res.json() as Record<string, unknown>;
      const err  = json.error as { code?: number; message?: string; type?: string; fbtrace_id?: string } | undefined;
      wabaCheck = {
        http_status:                  res.status,
        waba_name:                    (json as Record<string, string>).name                          ?? null,
        currency:                     (json as Record<string, string>).currency                     ?? null,
        account_review_status:        (json as Record<string, string>).account_review_status        ?? null,
        message_template_namespace:   (json as Record<string, string>).message_template_namespace   ?? null,
        meta_error:                   err  ?? null,
        raw:                          json,
      };
    } catch (e) {
      wabaCheckError = e instanceof Error ? e.message : String(e);
    }
  }

  // ── 6. Assess and summarise ───────────────────────────────────────────────
  const tokenValid     = debugTokenResult?.is_valid === true;
  const tokenExpired   = debugTokenResult?.is_expired === true;
  const phoneIdOk      = phoneNumberIdCheck?.http_status === 200;
  const wabaOk         = wabaCheck?.http_status === 200;

  let diagnosis = "UNKNOWN";
  if (decryptError) {
    diagnosis = "DECRYPT_FAILED — stored token cannot be decrypted. ENCRYPTION_KEY may differ between environments.";
  } else if (!accessToken) {
    diagnosis = "NO_TOKEN — access_token_enc is missing from integration config.";
  } else if (tokenExpired) {
    diagnosis = "TOKEN_EXPIRED — Meta confirmed is_valid=false (code 190). Must reconnect WhatsApp in Settings.";
  } else if (!tokenValid && debugTokenResult) {
    diagnosis = `TOKEN_INVALID — Meta returned is_valid=false. Error: ${JSON.stringify(debugTokenResult.token_error ?? debugTokenResult.meta_api_error)}`;
  } else if (!phoneIdOk && phoneNumberIdCheck) {
    diagnosis = `PHONE_NUMBER_ID_BAD — token may be valid but phone_number_id check returned HTTP ${phoneNumberIdCheck.http_status}. Wrong WABA or phone number ID stored.`;
  } else if (!wabaOk && wabaCheck) {
    diagnosis = `WABA_ID_BAD — token may be valid but WABA check returned HTTP ${wabaCheck.http_status}. Wrong WABA ID stored.`;
  } else if (tokenValid && phoneIdOk && wabaOk) {
    diagnosis = "ALL_OK — token is valid, phone number ID verified, WABA verified. If sends still fail check Vercel logs for the exact API error.";
  }

  return NextResponse.json({
    org_id:   orgId,
    row_id:   row.id,
    active:   row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,

    stored_config: {
      phone_number_id:     storedPhoneNumberId,
      waba_id:             storedWabaId,
      display_phone_number: storedDisplayPhone,
      access_token_preview: tokenPreview,
      access_token_enc_present: !!accessTokenEnc,
    },

    decrypt_error: decryptError,

    debug_token:       debugTokenResult,
    debug_token_error: debugTokenError,

    phone_number_id_check:       phoneNumberIdCheck,
    phone_number_id_check_error: phoneNumberIdError,

    waba_check:       wabaCheck,
    waba_check_error: wabaCheckError,

    env: {
      meta_app_id_set:     !!appId,
      meta_app_secret_set: !!appSecret,
      meta_app_id:         appId,
    },

    diagnosis,
  });
}
