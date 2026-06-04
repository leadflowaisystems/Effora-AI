/**
 * GET /api/debug/ig-subscription
 *
 * Admin-only diagnostic. Determines:
 *   1. Which Meta App issued the stored user access token (debug_token)
 *   2. Which Meta App owns the Instagram webhook subscription (subscribed_apps)
 *
 * Uses the user_access_token_enc stored in the first active meta_instagram
 * integration row — the same token used by subscribeIgToWebhooks().
 *
 * REMOVE after root cause is confirmed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { isAdminEmail } from "@/lib/admin";

const GRAPH   = "https://graph.facebook.com/v18.0";
const IG_ACCT = "17841424594812508";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Admin gate ──────────────────────────────────────────────────────────────
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Auth failed" }, { status: 401 });
  }

  const appId     = process.env.META_APP_ID     ?? "";
  const appSecret = process.env.META_APP_SECRET ?? "";

  if (!appId || !appSecret) {
    return NextResponse.json({
      error: "META_APP_ID or META_APP_SECRET not set in environment",
    }, { status: 500 });
  }

  // ── Load integration row ────────────────────────────────────────────────────
  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: integration, error: dbErr } = await (svc as any)
    .from("integrations")
    .select("org_id, config")
    .eq("provider", "meta_instagram")
    .eq("active", true)
    .maybeSingle();

  if (dbErr || !integration) {
    return NextResponse.json({
      error: "No active meta_instagram integration found",
      detail: dbErr?.message ?? null,
    }, { status: 404 });
  }

  const cfg = integration.config as Record<string, string>;

  // ── Decrypt user token ──────────────────────────────────────────────────────
  let userToken: string;
  try {
    const enc = cfg.user_access_token_enc;
    if (!enc) {
      return NextResponse.json({
        error: "user_access_token_enc is absent from integration config",
        hint:  "Re-connect Instagram — the OAuth callback stores this token.",
        config_keys: Object.keys(cfg),
      }, { status: 400 });
    }
    userToken = decryptSecret(enc);
  } catch (e) {
    return NextResponse.json({
      error:  "Failed to decrypt user_access_token_enc",
      detail: String(e),
    }, { status: 500 });
  }

  // ── Call 1: debug_token — which app issued this token? ─────────────────────
  let debugTokenResult: unknown;
  let debugTokenError: string | null = null;
  try {
    const url = new URL(`${GRAPH}/debug_token`);
    url.searchParams.set("input_token", userToken);
    url.searchParams.set("access_token", `${appId}|${appSecret}`);

    const res  = await fetch(url.toString());
    debugTokenResult = await res.json();
  } catch (e) {
    debugTokenError = String(e);
  }

  // ── Call 2: subscribed_apps — which app owns the IG subscription? ──────────
  let subscribedAppsResult: unknown;
  let subscribedAppsError: string | null = null;
  try {
    const url = new URL(`${GRAPH}/${IG_ACCT}/subscribed_apps`);
    url.searchParams.set("access_token", userToken);

    const res  = await fetch(url.toString());
    subscribedAppsResult = await res.json();
  } catch (e) {
    subscribedAppsError = String(e);
  }

  // ── Return everything ───────────────────────────────────────────────────────
  return NextResponse.json({
    meta: {
      ig_account_id:      IG_ACCT,
      org_id:             integration.org_id,
      env_app_id:         appId,
      env_secret_prefix:  appSecret.slice(0, 6),
      env_secret_length:  appSecret.length,
      user_token_prefix:  userToken.slice(0, 10) + "...",
      user_token_length:  userToken.length,
    },
    debug_token: {
      result: debugTokenResult ?? null,
      error:  debugTokenError,
    },
    subscribed_apps: {
      result: subscribedAppsResult ?? null,
      error:  subscribedAppsError,
    },
  });
}
