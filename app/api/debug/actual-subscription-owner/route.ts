/**
 * GET /api/debug/actual-subscription-owner
 *
 * Temporary PUBLIC diagnostic — NO AUTH.
 * Determines which Meta App owns the webhook subscription for
 * Instagram Business Account 17841424594812508.
 *
 * Instagram Messaging webhook subscriptions are registered on the FACEBOOK PAGE
 * linked to the IG account, not on the IG object itself.
 * The correct ownership endpoint is GET /{page-id}/subscribed_apps.
 *
 * Calls made:
 *   1. GET /{page-id}/subscribed_apps  — lists every app subscribed to the page
 *                                        and which webhook fields each owns
 *   2. GET /debug_token                — confirms which app_id issued our token
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

  // Load all meta_instagram rows — pick the active one with a system-user token
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

  if (!candidate) {
    return NextResponse.json({
      error: "No active meta_instagram row with user_access_token_enc found",
      total_rows: (rows ?? []).length,
    }, { status: 404 });
  }

  const cfg = candidate.config as Record<string, string>;
  const pageId  = cfg.page_id ?? null;
  const orgId   = candidate.org_id as string;

  // Decrypt system-user token
  let userToken: string;
  try {
    userToken = decryptSecret(cfg.user_access_token_enc);
  } catch (e) {
    return NextResponse.json({ error: "Token decryption failed", detail: String(e) }, { status: 500 });
  }

  // Load app credentials for debug_token call
  const metaConfig = await getMetaConfig(orgId);
  const appAccessToken = metaConfig
    ? `${metaConfig.app_id}|${metaConfig.app_secret}`
    : null;

  // ── 1. GET /{page-id}/subscribed_apps ────────────────────────────────────────
  // This is the correct ownership endpoint. Returns every app subscribed to the
  // page, with the webhook fields each app is watching.
  let pageSubscribedAppsUrl: string | null = null;
  let pageSubscribedAppsResult: unknown = null;

  if (pageId && userToken) {
    const url = new URL(`${GRAPH}/${pageId}/subscribed_apps`);
    url.searchParams.set("access_token", userToken);
    pageSubscribedAppsUrl = `${GRAPH}/${pageId}/subscribed_apps?access_token=[SYSTEM_USER_TOKEN_REDACTED]`;
    const res = await fetch(url.toString());
    pageSubscribedAppsResult = await res.json();
  } else {
    pageSubscribedAppsResult = {
      skipped: true,
      reason: pageId ? "no user token" : "page_id not found in integration config",
    };
  }

  // ── 2. GET /debug_token — verify which app issued the system-user token ───────
  let debugTokenUrl: string | null = null;
  let debugTokenResult: unknown = null;

  if (appAccessToken) {
    const url = new URL(`${GRAPH}/debug_token`);
    url.searchParams.set("input_token", userToken);
    url.searchParams.set("access_token", appAccessToken);
    debugTokenUrl = `${GRAPH}/debug_token?input_token=[SYSTEM_USER_TOKEN_REDACTED]&access_token=[APP_TOKEN_REDACTED]`;
    const res = await fetch(url.toString());
    debugTokenResult = await res.json();
  } else {
    debugTokenResult = { skipped: true, reason: "no app credentials available for debug_token" };
  }

  // ── Extract any app IDs found in page subscribed_apps ────────────────────────
  type SubscribedApp = { id?: string; name?: string; link?: string; subscribed_fields?: string[] };
  const subscribedAppIds: string[] = (
    (pageSubscribedAppsResult as { data?: SubscribedApp[] })?.data ?? []
  ).map((a) => a.id ?? "unknown");

  const configuredAppId  = metaConfig?.app_id ?? null;
  const foreignApps      = subscribedAppIds.filter((id) => id !== configuredAppId);

  return NextResponse.json({
    summary: {
      ig_account:          IG_ACCT,
      page_id:             pageId,
      configured_app_id:   configuredAppId,
      apps_owning_page_subscription: subscribedAppIds,
      foreign_app_ids:     foreignApps,
      foreign_app_detected: foreignApps.length > 0,
    },
    page_subscribed_apps: {
      url:    pageSubscribedAppsUrl,
      result: pageSubscribedAppsResult,
    },
    debug_token: {
      url:    debugTokenUrl,
      result: debugTokenResult,
    },
    candidate_row_id: candidate.id,
  });
}
