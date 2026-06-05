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
  const pageId = cfg.page_id ?? null;
  const orgId  = candidate.org_id as string;

  // Decrypt PAGE access token (access_token_enc) — required by new Pages experience
  let pageToken: string;
  let pageTokenDecryptError: string | null = null;
  try {
    pageToken = decryptSecret(cfg.access_token_enc);
  } catch (e) {
    pageTokenDecryptError = String(e);
    return NextResponse.json({ error: "Page token decryption failed", detail: pageTokenDecryptError }, { status: 500 });
  }

  // Confirm token type prefix for logging (first 6 chars only — safe to expose)
  const pageTokenPrefix = pageToken.slice(0, 6);

  // Load app credentials for debug_token call only
  const metaConfig = await getMetaConfig(orgId);
  const appAccessToken = metaConfig
    ? `${metaConfig.app_id}|${metaConfig.app_secret}`
    : null;

  // ── 1. GET /{page-id}/subscribed_apps using PAGE ACCESS TOKEN ─────────────────
  let pageSubscribedAppsUrl: string | null = null;
  let pageSubscribedAppsResult: unknown = null;

  if (pageId) {
    const url = new URL(`${GRAPH}/${pageId}/subscribed_apps`);
    url.searchParams.set("access_token", pageToken);
    pageSubscribedAppsUrl = `${GRAPH}/${pageId}/subscribed_apps?access_token=[PAGE_TOKEN_REDACTED]`;
    const res = await fetch(url.toString());
    pageSubscribedAppsResult = await res.json();
  } else {
    pageSubscribedAppsResult = { skipped: true, reason: "page_id not found in integration config" };
  }

  // ── 2. GET /debug_token — verify token type and issuing app ──────────────────
  let debugTokenUrl: string | null = null;
  let debugTokenResult: unknown = null;

  if (appAccessToken) {
    const url = new URL(`${GRAPH}/debug_token`);
    url.searchParams.set("input_token", pageToken);
    url.searchParams.set("access_token", appAccessToken);
    debugTokenUrl = `${GRAPH}/debug_token?input_token=[PAGE_TOKEN_REDACTED]&access_token=[APP_TOKEN_REDACTED]`;
    const res = await fetch(url.toString());
    debugTokenResult = await res.json();
  } else {
    debugTokenResult = { skipped: true, reason: "no app credentials available for debug_token" };
  }

  // ── Extract app IDs and subscribed fields ─────────────────────────────────────
  type SubscribedApp = { id?: string; name?: string; link?: string; subscribed_fields?: string[] };
  const subscribedData: SubscribedApp[] =
    (pageSubscribedAppsResult as { data?: SubscribedApp[] })?.data ?? [];
  const subscribedAppIds    = subscribedData.map((a) => a.id ?? "unknown");
  const configuredAppId     = metaConfig?.app_id ?? null;
  const foreignApps         = subscribedAppIds.filter((id) => id !== configuredAppId);

  return NextResponse.json({
    summary: {
      ig_account:                    IG_ACCT,
      page_id:                       pageId,
      configured_app_id:             configuredAppId,
      token_source:                  "access_token_enc (Page Access Token)",
      page_token_prefix:             pageTokenPrefix,
      apps_owning_page_subscription: subscribedAppIds,
      subscribed_fields_by_app:      subscribedData.map((a) => ({
        app_id:           a.id,
        app_name:         a.name,
        subscribed_fields: a.subscribed_fields,
      })),
      foreign_app_ids:               foreignApps,
      foreign_app_detected:          foreignApps.length > 0,
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
