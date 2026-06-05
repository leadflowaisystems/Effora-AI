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

  // Compute appsecret_proof = HMAC-SHA256(app_secret, access_token)
  // Meta validates this against their stored App Secret for appId.
  // If the proof is wrong → error 190 subcode 1 → our secret is WRONG.
  // If the proof is right → call succeeds → our secret is CORRECT.
  const appsecretProof = createHmac("sha256", appSecret)
    .update(userToken)
    .digest("hex");

  // Call GET /me with appsecret_proof — forces Meta to validate our secret
  const url = new URL(`${GRAPH}/me`);
  url.searchParams.set("access_token",    userToken);
  url.searchParams.set("appsecret_proof", appsecretProof);
  url.searchParams.set("fields",          "id,name");

  const res  = await fetch(url.toString());
  const json = await res.json() as Record<string, unknown>;

  // Also call GET /me WITHOUT appsecret_proof as a baseline —
  // this proves the token itself is valid regardless of the secret.
  const urlNoProof = new URL(`${GRAPH}/me`);
  urlNoProof.searchParams.set("access_token", userToken);
  urlNoProof.searchParams.set("fields",       "id,name");
  const resNoProof  = await fetch(urlNoProof.toString());
  const jsonNoProof = await resNoProof.json() as Record<string, unknown>;

  // Interpret the result
  const error      = json.error as { code?: number; error_subcode?: number; message?: string } | undefined;
  const isWrongSecret =
    error?.code === 190 && error?.error_subcode === 1;
  const isCorrectSecret = !error && !!json.id;

  return NextResponse.json({
    conclusion: isCorrectSecret
      ? "SECRET IS CORRECT — appsecret_proof validated by Meta"
      : isWrongSecret
        ? "SECRET IS WRONG — Meta rejected appsecret_proof (error 190 subcode 1)"
        : "INCONCLUSIVE — unexpected response (see raw_response)",

    app_id:          appId,
    secret_prefix:   appSecret.slice(0, 6),
    secret_length:   appSecret.length,

    // appsecret_proof call result
    with_proof: {
      http_status:   res.status,
      raw_response:  json,
    },

    // Baseline call without proof — confirms token validity independent of secret
    without_proof: {
      http_status:   resNoProof.status,
      raw_response:  jsonNoProof,
      token_valid:   !jsonNoProof.error && !!jsonNoProof.id,
    },

    candidate_row_id: candidate.id,
  });
}
