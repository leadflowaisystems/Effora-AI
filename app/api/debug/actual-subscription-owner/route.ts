/**
 * GET /api/debug/actual-subscription-owner
 *
 * Temporary PUBLIC diagnostic — NO AUTH.
 * Determines which Meta App ID currently owns the webhook subscription for
 * Instagram Business Account 17841424594812508 by making three Graph API calls:
 *
 *   1. GET /debug_token — reveals the app_id that issued the stored user token
 *   2. GET /app/subscriptions — lists webhook subscriptions registered by OUR app
 *   3. GET /{ig-id}/subscribed_apps — lists apps subscribed to the IG account
 *
 * REMOVE immediately after debugging is complete.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { getMetaConfig } from "@/lib/meta-config";

const GRAPH   = "https://graph.facebook.com/v18.0";
const IG_ACCT = "17841424594812508";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const svc = createServiceClient();

  // Load the active meta_instagram row that has a user token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: dbErr } = await (svc as any)
    .from("integrations")
    .select("id, org_id, active, created_at, config")
    .eq("provider", "meta_instagram")
    .order("created_at", { ascending: false });

  if (dbErr) {
    return NextResponse.json({ error: "DB query failed", detail: dbErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = (rows ?? []).find((r: any) =>
    r.active && (r.config as Record<string, string>)?.user_access_token_enc,
  );

  let userToken: string | null = null;
  let tokenDecryptError: string | null = null;
  let candidateOrgId: string | null = null;

  if (candidate) {
    candidateOrgId = candidate.org_id;
    try {
      userToken = decryptSecret((candidate.config as Record<string, string>).user_access_token_enc);
    } catch (e) {
      tokenDecryptError = String(e);
    }
  }

  // Load meta app config so we can build an app access token
  const metaConfig = await getMetaConfig(candidateOrgId ?? "any");
  const appAccessToken = metaConfig
    ? `${metaConfig.app_id}|${metaConfig.app_secret}`
    : null;

  // ── 1. debug_token — which app issued our stored user token ──────────────────
  let debugTokenResult: unknown = null;
  if (userToken && appAccessToken) {
    const url = new URL(`${GRAPH}/debug_token`);
    url.searchParams.set("input_token", userToken);
    url.searchParams.set("access_token", appAccessToken);
    const res = await fetch(url.toString());
    debugTokenResult = await res.json();
  } else {
    debugTokenResult = {
      skipped: true,
      reason: userToken ? "no app access token" : "no user token to inspect",
    };
  }

  // ── 2. GET /app/subscriptions — what webhooks OUR app has registered ─────────
  let appSubscriptionsUrl: string | null = null;
  let appSubscriptionsResult: unknown = null;
  if (appAccessToken && metaConfig) {
    const url = new URL(`${GRAPH}/${metaConfig.app_id}/subscriptions`);
    url.searchParams.set("access_token", appAccessToken);
    appSubscriptionsUrl = `${GRAPH}/${metaConfig.app_id}/subscriptions`;
    const res = await fetch(url.toString());
    appSubscriptionsResult = await res.json();
  } else {
    appSubscriptionsResult = { skipped: true, reason: "no app credentials available" };
  }

  // ── 3. GET /{ig-id}/subscribed_apps — apps subscribed to the IG account ──────
  // Must use the system-user token, NOT an app access token (app_id|secret).
  let subscribedAppsUrl: string | null = null;
  let subscribedAppsResult: unknown = null;
  if (userToken) {
    const url = new URL(`${GRAPH}/${IG_ACCT}/subscribed_apps`);
    url.searchParams.set("access_token", userToken);
    subscribedAppsUrl = `${GRAPH}/${IG_ACCT}/subscribed_apps?access_token=[SYSTEM_USER_TOKEN_REDACTED]`;
    const res = await fetch(url.toString());
    subscribedAppsResult = await res.json();
  } else {
    subscribedAppsResult = { skipped: true, reason: "no system-user token available" };
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const configuredAppId = metaConfig?.app_id ?? null;

  // Extract token's app_id from debug_token response if available
  const tokenAppId =
    (debugTokenResult as { data?: { app_id?: string } })?.data?.app_id ?? null;

  const mismatch =
    configuredAppId && tokenAppId && configuredAppId !== tokenAppId;

  return NextResponse.json({
    summary: {
      configured_app_id:  configuredAppId,
      token_issued_by_app_id: tokenAppId,
      app_id_mismatch:    mismatch,
      ig_account:         IG_ACCT,
      candidate_row_id:   candidate?.id ?? null,
    },
    debug_token:       debugTokenResult,
    app_subscriptions: {
      url:    appSubscriptionsUrl,
      result: appSubscriptionsResult,
    },
    subscribed_apps: {
      url:    subscribedAppsUrl,
      result: subscribedAppsResult,
    },
    token_decrypt_error: tokenDecryptError,
  });
}
