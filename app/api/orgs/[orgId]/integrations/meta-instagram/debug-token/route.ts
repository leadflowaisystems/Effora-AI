/**
 * GET /api/orgs/[orgId]/integrations/meta-instagram/debug-token
 *
 * TEMPORARY DIAGNOSTIC — Token inspection for architecture verification.
 *
 * Decrypts both stored tokens and calls Graph API /debug_token for each.
 * Returns token_type, scopes, granular_scopes, expires_at, app_id.
 * Raw token values are NEVER returned — only the debug_token response.
 *
 * Remove this route once token types are confirmed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";

interface Params { params: { orgId: string } }

const GRAPH = "https://graph.facebook.com/v18.0";

interface DebugTokenResponse {
  data?: {
    app_id?:          string;
    type?:            string;
    application?:     string;
    expires_at?:      number;
    is_valid?:        boolean;
    scopes?:          string[];
    granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
    user_id?:         string;
    error?:           { code: number; message: string; subcode?: number };
  };
  error?: { message: string; code: number };
}

async function inspectToken(
  token: string,
  appId: string,
  appSecret: string,
): Promise<DebugTokenResponse["data"] & { raw_error?: string }> {
  try {
    const appToken = `${appId}|${appSecret}`;
    const url = `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
    const res = await fetch(url);
    const json = await res.json() as DebugTokenResponse;

    if (json.error) {
      return { raw_error: `HTTP-level error: ${json.error.message} (code ${json.error.code})` } as never;
    }
    return json.data ?? { raw_error: "debug_token returned no data" } as never;
  } catch (e) {
    return { raw_error: `fetch failed: ${e instanceof Error ? e.message : String(e)}` } as never;
  }
}

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appId     = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "META_APP_ID or META_APP_SECRET not set in env vars — cannot call debug_token" },
      { status: 500 },
    );
  }

  const svc = createServiceClient();
  const { data: intRow, error: intErr } = await svc
    .from("integrations")
    .select("config, active")
    .eq("org_id", params.orgId)
    .eq("provider", "meta_instagram")
    .maybeSingle();

  if (intErr || !intRow?.active) {
    return NextResponse.json(
      { error: "No active Instagram integration found." },
      { status: 404 },
    );
  }

  const cfg = intRow.config as Record<string, string>;

  // ── Token 1: Page access token (from /me/accounts) ──────────────────────────
  let pageTokenDebug: ReturnType<typeof inspectToken> extends Promise<infer T> ? T : never;
  const pageTokenEnc = cfg.access_token_enc;
  if (!pageTokenEnc) {
    pageTokenDebug = { raw_error: "access_token_enc not present in config" } as never;
  } else {
    try {
      const pageToken = decryptSecret(pageTokenEnc);
      pageTokenDebug = await inspectToken(pageToken, appId, appSecret);
    } catch (e) {
      pageTokenDebug = { raw_error: `decrypt failed: ${e instanceof Error ? e.message : String(e)}` } as never;
    }
  }

  // ── Token 2: User/system-user token (from OAuth code exchange) ────────────
  let userTokenDebug: ReturnType<typeof inspectToken> extends Promise<infer T> ? T : never;
  const userTokenEnc = cfg.user_access_token_enc;
  if (!userTokenEnc) {
    userTokenDebug = { raw_error: "user_access_token_enc not present — integration was connected before the realignment fix was deployed. Reconnect Instagram to populate this token." } as never;
  } else {
    try {
      const userToken = decryptSecret(userTokenEnc);
      userTokenDebug = await inspectToken(userToken, appId, appSecret);
    } catch (e) {
      userTokenDebug = { raw_error: `decrypt failed: ${e instanceof Error ? e.message : String(e)}` } as never;
    }
  }

  return NextResponse.json({
    ig_username:                   cfg.ig_username,
    page_id:                       cfg.page_id,
    instagram_business_account_id: cfg.instagram_business_account_id,
    tokens: {
      page_token: {
        description:  "Facebook Page Access Token — from GET /me/accounts — stored as access_token_enc",
        expected_type: "PAGE",
        debug: pageTokenDebug,
      },
      user_token: {
        description:  "User/System-User Access Token — from OAuth code exchange — stored as user_access_token_enc",
        expected_type: "USER or SYSTEM_USER",
        debug: userTokenDebug,
      },
    },
    question: "Can the user/system-user token call POST /17841424594812508/subscribed_apps?",
    answer_criteria: {
      required_token_type: "USER or SYSTEM_USER (not PAGE)",
      required_scopes: ["instagram_basic OR instagram_business_basic", "instagram_manage_messages OR instagram_business_manage_messages"],
      required_app_id: appId,
    },
  });
}
