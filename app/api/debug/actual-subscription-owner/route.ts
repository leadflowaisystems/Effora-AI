/**
 * GET /api/debug/actual-subscription-owner
 *
 * Temporary PUBLIC diagnostic — NO AUTH.
 * Attempts to determine which Meta App(s) are subscribed to receive webhooks
 * for Instagram Business Account 17841424594812508 / Facebook Page 1209422672248916.
 *
 * Makes four independent Graph API calls using every available token/approach:
 *   1. GET /{page-id}/subscribed_apps  — with page access token
 *   2. GET /{page-id}/subscribed_apps  — with system-user token
 *   3. GET /{ig-id}/subscribed_apps    — with system-user token (documents the error)
 *   4. GET /{app-id}/subscriptions     — with app access token (app_id|secret)
 *
 * REMOVE immediately after debugging is complete.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { getMetaConfig } from "@/lib/meta-config";
import { createHmac } from "crypto";

const GRAPH   = "https://graph.facebook.com/v18.0";
const IG_ACCT = "17841424594812508";
const PAGE_ID = "1209422672248916";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function graphGet(url: URL, label: string) {
  try {
    const res  = await fetch(url.toString());
    const json = await res.json();
    return { label, status: res.status, result: json };
  } catch (e) {
    return { label, status: null, result: { fetch_error: String(e) } };
  }
}

export async function GET() {
  // Production guard — this diagnostic is dev-only
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const svc = createServiceClient();

  // Load active meta_instagram rows
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
    return NextResponse.json({ error: "No active meta_instagram row with user_access_token_enc" }, { status: 404 });
  }

  const cfg    = candidate.config as Record<string, string>;
  const orgId  = candidate.org_id as string;

  // Decrypt both tokens
  let pageToken: string | null = null;
  let userToken: string | null = null;

  try { pageToken = decryptSecret(cfg.access_token_enc); }      catch { pageToken = null; }
  try { userToken = decryptSecret(cfg.user_access_token_enc); } catch { userToken = null; }

  const metaConfig     = await getMetaConfig(orgId);
  const appAccessToken = metaConfig ? `${metaConfig.app_id}|${metaConfig.app_secret}` : null;

  // Hash both tokens for cross-reference (same salt as webhook handler)
  const pageTokenHash = pageToken
    ? createHmac("sha256", "diagnostic-salt").update(pageToken).digest("hex").slice(0, 16)
    : null;
  const userTokenHash = userToken
    ? createHmac("sha256", "diagnostic-salt").update(userToken).digest("hex").slice(0, 16)
    : null;

  // ── Call 1: GET /{page-id}/subscribed_apps with PAGE token ───────────────────
  const call1 = pageToken
    ? await graphGet(
        Object.assign(new URL(`${GRAPH}/${PAGE_ID}/subscribed_apps`), {
          search: `?access_token=${pageToken}`,
        }) as URL,
        "page_subscribed_apps__page_token",
      )
    : { label: "page_subscribed_apps__page_token", status: null, result: { skipped: "no page token" } };

  // ── Call 2: GET /{page-id}/subscribed_apps with SYSTEM-USER token ────────────
  const call2 = userToken
    ? await graphGet(
        Object.assign(new URL(`${GRAPH}/${PAGE_ID}/subscribed_apps`), {
          search: `?access_token=${userToken}`,
        }) as URL,
        "page_subscribed_apps__user_token",
      )
    : { label: "page_subscribed_apps__user_token", status: null, result: { skipped: "no user token" } };

  // ── Call 3: GET /{ig-id}/subscribed_apps with SYSTEM-USER token ──────────────
  const call3 = userToken
    ? await graphGet(
        Object.assign(new URL(`${GRAPH}/${IG_ACCT}/subscribed_apps`), {
          search: `?access_token=${userToken}`,
        }) as URL,
        "ig_subscribed_apps__user_token",
      )
    : { label: "ig_subscribed_apps__user_token", status: null, result: { skipped: "no user token" } };

  // ── Call 4: GET /{app-id}/subscriptions with APP token ───────────────────────
  const call4 = (appAccessToken && metaConfig)
    ? await graphGet(
        Object.assign(new URL(`${GRAPH}/${metaConfig.app_id}/subscriptions`), {
          search: `?access_token=${appAccessToken}`,
        }) as URL,
        "app_subscriptions__app_token",
      )
    : { label: "app_subscriptions__app_token", status: null, result: { skipped: "no app credentials" } };

  // ── Call 5: GET /{ig-id}?fields=id,name,username — basic IG account check ────
  const call5 = userToken
    ? await graphGet(
        Object.assign(new URL(`${GRAPH}/${IG_ACCT}`), {
          search: `?fields=id,name,username&access_token=${userToken}`,
        }) as URL,
        "ig_account_info",
      )
    : { label: "ig_account_info", status: null, result: { skipped: "no user token" } };

  return NextResponse.json({
    meta: {
      ig_account:        IG_ACCT,
      page_id:           PAGE_ID,
      configured_app_id: metaConfig?.app_id ?? null,
      configured_config_id: metaConfig?.config_id ?? null,
      candidate_row_id:  candidate.id,
      page_token_hash:   pageTokenHash,   // first 16 chars of salted hash — cross-reference only
      user_token_hash:   userTokenHash,
    },
    calls: [call1, call2, call3, call4, call5],
  });
}
