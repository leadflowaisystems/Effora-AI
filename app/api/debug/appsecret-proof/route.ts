/**
 * GET /api/debug/appsecret-proof
 *
 * Temporary PUBLIC diagnostic — NO AUTH.
 *
 * Definitively proves whether META_APP_SECRET is the correct App Secret
 * for App ID stored in META_APP_ID.
 *
 * Method: appsecret_proof = HMAC-SHA256(app_secret, access_token)
 *
 * Meta validates this server-side. If the secret is correct, the API call
 * succeeds and returns the system-user's ID. If the secret is wrong, Meta
 * returns error code 190, subcode 1: "Invalid appsecret_proof provided".
 *
 * This is the ONLY test that directly asks Meta "is this the right secret?"
 * independent of webhook body content, HMAC timing, or body encoding.
 *
 * REMOVE immediately after debugging is complete.
 */

import { NextResponse }      from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret }     from "@/lib/crypto";
import { createHmac }        from "crypto";

const GRAPH = "https://graph.facebook.com/v18.0";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const appSecret = process.env.META_APP_SECRET ?? null;
  const appId     = process.env.META_APP_ID     ?? null;

  if (!appSecret || !appId) {
    return NextResponse.json({ error: "META_APP_SECRET or META_APP_ID not set" }, { status: 500 });
  }

  // Load system-user token from the active meta_instagram integration row
  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (svc as any)
    .from("integrations")
    .select("id, org_id, config")
    .eq("provider", "meta_instagram")
    .eq("active", true)
    .order("created_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = (rows ?? []).find((r: any) =>
    (r.config as Record<string, string>)?.user_access_token_enc,
  );

  if (!candidate) {
    return NextResponse.json({ error: "No active meta_instagram row with user_access_token_enc" }, { status: 404 });
  }

  const cfg = candidate.config as Record<string, string>;
  let userToken: string;
  try {
    userToken = decryptSecret(cfg.user_access_token_enc);
  } catch (e) {
    return NextResponse.json({ error: "Token decryption failed", detail: String(e) }, { status: 500 });
  }

  // ── Test 1: GET /debug_token with app access token ───────────────────────────
  // The access_token parameter is the app access token: app_id|app_secret.
  // Meta validates this token server-side.
  // CORRECT secret → Meta returns full token inspection data
  // WRONG secret   → Meta returns OAuthException error 190
  //
  // Note: appsecret_proof via /me was attempted first but returns code 100
  // "GraphMethodException: Invalid appsecret_proof provided in the API argument"
  // for system-user tokens because appsecret_proof is only defined for user tokens.
  // GET /debug_token is the correct probe for system-user tokens.
  const appAccessToken = `${appId}|${appSecret}`;

  const urlDebugToken = new URL(`${GRAPH}/debug_token`);
  urlDebugToken.searchParams.set("input_token",  userToken);
  urlDebugToken.searchParams.set("access_token", appAccessToken);

  const resDebug  = await fetch(urlDebugToken.toString());
  const jsonDebug = await resDebug.json() as Record<string, unknown>;

  // ── Test 2: GET /me — baseline token validity (no secret involved) ───────────
  const urlMe = new URL(`${GRAPH}/me`);
  urlMe.searchParams.set("access_token", userToken);
  urlMe.searchParams.set("fields",       "id,name");
  const resMe  = await fetch(urlMe.toString());
  const jsonMe = await resMe.json() as Record<string, unknown>;

  // ── Test 3: appsecret_proof via /me — kept for reference ─────────────────────
  // Returns code 100 for system-user tokens. Included for completeness.
  const appsecretProof = createHmac("sha256", appSecret).update(userToken).digest("hex");
  const urlProof = new URL(`${GRAPH}/me`);
  urlProof.searchParams.set("access_token",    userToken);
  urlProof.searchParams.set("appsecret_proof", appsecretProof);
  urlProof.searchParams.set("fields",          "id,name");
  const resProof  = await fetch(urlProof.toString());
  const jsonProof = await resProof.json() as Record<string, unknown>;

  // ── Interpret debug_token result ──────────────────────────────────────────────
  const debugError = jsonDebug.error as { code?: number; type?: string; message?: string } | undefined;
  const debugData  = jsonDebug.data  as { app_id?: string; is_valid?: boolean; type?: string; application?: string } | undefined;

  // Wrong secret → app access token invalid → OAuthException code 190
  const appTokenRejected   = !!debugError && debugError.code === 190;
  // Correct secret → app token valid → debug_token returns token inspection data
  const appTokenAccepted   = !debugError && !!debugData?.app_id;

  let conclusion: string;
  if (appTokenAccepted) {
    conclusion = "SECRET IS CORRECT — app access token (app_id|secret) accepted by Meta debug_token";
  } else if (appTokenRejected) {
    conclusion = "SECRET IS WRONG — app access token rejected with OAuthException 190";
  } else {
    conclusion = "INCONCLUSIVE — unexpected debug_token response (see debug_token_result)";
  }

  return NextResponse.json({
    conclusion,
    app_id:        appId,
    secret_prefix: appSecret.slice(0, 6),
    secret_length: appSecret.length,

    // Primary test — debug_token with app access token
    debug_token_result: {
      http_status:       resDebug.status,
      raw_response:      jsonDebug,
      app_token_valid:   appTokenAccepted,
      app_token_rejected: appTokenRejected,
      token_app_id:      debugData?.app_id   ?? null,
      token_is_valid:    debugData?.is_valid  ?? null,
      token_type:        debugData?.type      ?? null,
    },

    // Baseline — confirms system-user token itself is alive
    me_without_proof: {
      http_status:  resMe.status,
      raw_response: jsonMe,
      token_valid:  !jsonMe.error && !!jsonMe.id,
    },

    // Reference only — expected to fail with code 100 for system-user tokens
    me_with_appsecret_proof: {
      http_status:  resProof.status,
      raw_response: jsonProof,
      note:         "code 100 is expected here for system-user tokens — does not indicate wrong secret",
    },

    candidate_row_id: candidate.id,
  });
}
