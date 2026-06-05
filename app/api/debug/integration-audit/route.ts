/**
 * GET /api/debug/integration-audit
 *
 * Temporary PUBLIC diagnostic — NO AUTH.
 *
 * Audits every meta_instagram integration row in the database and calls
 * GET /debug_token for each stored token to identify which Meta App issued it.
 *
 * For each row reports:
 *   - id, org_id, active, created_at, updated_at
 *   - page_id, instagram_business_account_id, ig_username
 *   - Whether access_token_enc and user_access_token_enc are present
 *   - debug_token result for BOTH tokens (which app issued each)
 *   - Whether the issuing app_id matches META_APP_ID (new app)
 *
 * Also reports which row the webhook handler would select for
 * IG account 17841424594812508, and which row the appsecret-proof
 * diagnostic selected (by replicating its find() logic).
 *
 * REMOVE immediately after debugging is complete.
 */

import { NextResponse }        from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret }       from "@/lib/crypto";

const GRAPH   = "https://graph.facebook.com/v18.0";
const IG_ACCT = "17841424594812508";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function callDebugToken(
  inputToken:     string,
  appAccessToken: string,
  label:          string,
) {
  try {
    const url = new URL(`${GRAPH}/debug_token`);
    url.searchParams.set("input_token",  inputToken);
    url.searchParams.set("access_token", appAccessToken);
    const res  = await fetch(url.toString());
    const json = await res.json() as Record<string, unknown>;
    const data  = json.data  as { app_id?: string; is_valid?: boolean; type?: string; application?: string; expires_at?: number } | undefined;
    const error = json.error as { code?: number; message?: string } | undefined;
    return {
      label,
      issued_by_app_id:  data?.app_id    ?? null,
      token_type:        data?.type      ?? null,
      application:       data?.application ?? null,
      is_valid:          data?.is_valid   ?? null,
      expires_at:        data?.expires_at ?? null,
      error_code:        error?.code      ?? null,
      error_message:     error?.message   ?? null,
      raw:               json,
    };
  } catch (e) {
    return { label, error_message: String(e), issued_by_app_id: null, is_valid: null };
  }
}

export async function GET() {
  const appId     = process.env.META_APP_ID     ?? null;
  const appSecret = process.env.META_APP_SECRET ?? null;

  if (!appId || !appSecret) {
    return NextResponse.json({ error: "META_APP_ID or META_APP_SECRET not set" }, { status: 500 });
  }

  const appAccessToken = `${appId}|${appSecret}`;
  const svc = createServiceClient();

  // Fetch ALL rows — active and inactive — ordered newest first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: dbErr } = await (svc as any)
    .from("integrations")
    .select("id, org_id, active, created_at, updated_at, config")
    .eq("provider", "meta_instagram")
    .order("created_at", { ascending: false });

  if (dbErr) {
    return NextResponse.json({ error: "DB error", detail: dbErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditRows = await Promise.all((rows ?? []).map(async (r: any) => {
    const cfg = (r.config ?? {}) as Record<string, string>;

    // Decrypt tokens (best-effort)
    let pageToken:   string | null = null;
    let userToken:   string | null = null;
    let pageDecryptErr: string | null = null;
    let userDecryptErr: string | null = null;

    if (cfg.access_token_enc) {
      try { pageToken = decryptSecret(cfg.access_token_enc); }
      catch (e) { pageDecryptErr = String(e); }
    }
    if (cfg.user_access_token_enc) {
      try { userToken = decryptSecret(cfg.user_access_token_enc); }
      catch (e) { userDecryptErr = String(e); }
    }

    // Call debug_token for each present token
    const pageTokenDebug = pageToken
      ? await callDebugToken(pageToken, appAccessToken, "access_token_enc (page token)")
      : null;

    const userTokenDebug = userToken
      ? await callDebugToken(userToken, appAccessToken, "user_access_token_enc (system-user token)")
      : null;

    // Determine if the issuing app matches the current configured app
    const pageIssuedByNewApp = pageTokenDebug?.issued_by_app_id === appId;
    const userIssuedByNewApp = userTokenDebug?.issued_by_app_id === appId;
    const pageIssuedByOldApp = pageTokenDebug?.issued_by_app_id === "1883195202375416";
    const userIssuedByOldApp = userTokenDebug?.issued_by_app_id === "1883195202375416";

    return {
      id:                            r.id,
      org_id:                        r.org_id,
      active:                        r.active,
      created_at:                    r.created_at,
      updated_at:                    r.updated_at,
      page_id:                       cfg.page_id                       ?? null,
      instagram_business_account_id: cfg.instagram_business_account_id ?? null,
      ig_username:                   cfg.ig_username                   ?? null,
      token_expires_at:              cfg.token_expires_at              ?? null,
      has_access_token_enc:          !!cfg.access_token_enc,
      has_user_access_token_enc:     !!cfg.user_access_token_enc,
      page_decrypt_error:            pageDecryptErr,
      user_decrypt_error:            userDecryptErr,
      page_token_audit:              pageTokenDebug,
      user_token_audit:              userTokenDebug,
      page_token_issued_by_new_app:  pageIssuedByNewApp,
      user_token_issued_by_new_app:  userIssuedByNewApp,
      page_token_issued_by_old_app:  pageIssuedByOldApp,
      user_token_issued_by_old_app:  userIssuedByOldApp,
    };
  }));

  // ── Replicate appsecret-proof candidate selection logic ───────────────────
  // Finds the first active row with user_access_token_enc (newest-first order)
  // This is what the appsecret-proof and several other diagnostics pick
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proofCandidate = (rows ?? []).find((r: any) =>
    r.active && (r.config as Record<string, string>)?.user_access_token_enc,
  );

  // ── Replicate webhook handler selection logic ─────────────────────────────
  // Loads ALL active rows then finds by ig_account_id or page_id
  // No ORDER BY — DB default order (insertion order)
  const activeRows = (rows ?? []).filter((r: any) => r.active);
  const webhookCandidate = activeRows.find((r: any) => {
    const cfg = r.config as Record<string, string>;
    return (
      cfg?.instagram_business_account_id === IG_ACCT ||
      cfg?.page_id === IG_ACCT
    );
  });

  return NextResponse.json({
    configured_app_id: appId,
    old_app_id:        "1883195202375416",
    total_rows:        (rows ?? []).length,

    rows: auditRows,

    selection_analysis: {
      // Which row diagnostics (appsecret-proof, actual-subscription-owner) pick
      proof_diagnostic_picks: proofCandidate
        ? {
            id:         proofCandidate.id,
            org_id:     proofCandidate.org_id,
            created_at: proofCandidate.created_at,
            updated_at: proofCandidate.updated_at,
          }
        : null,

      // Which row the webhook handler finds for IG account 17841424594812508
      // NOTE: webhook handler has no ORDER BY — this replicates DB insertion order
      webhook_handler_picks: webhookCandidate
        ? {
            id:         webhookCandidate.id,
            org_id:     webhookCandidate.org_id,
            created_at: webhookCandidate.created_at,
            updated_at: webhookCandidate.updated_at,
          }
        : null,

      // Are the two different rows?
      selections_diverge: proofCandidate?.id !== webhookCandidate?.id,
    },
  });
}
