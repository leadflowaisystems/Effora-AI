/**
 * POST /api/orgs/[orgId]/integrations/meta-instagram/resubscribe
 *
 * Re-triggers the Instagram webhook subscription using credentials stored
 * from the last OAuth flow. No re-OAuth required if user_access_token_enc
 * is present (stored since the architecture realignment commit).
 *
 * Calls POST /v18.0/{ig_account_id}/subscribed_apps using the user/system-user
 * access token. This is the Instagram Messaging API subscription endpoint.
 * The page access token does NOT work here — only user/system-user tokens do.
 *
 * If user_access_token_enc is absent (connected before this fix was deployed),
 * the endpoint returns an error directing the user to reconnect via OAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { subscribeIgToWebhooks } from "@/lib/integrations/meta-instagram";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  const { data: intRow, error: intErr } = await svc
    .from("integrations")
    .select("config, active")
    .eq("org_id", params.orgId)
    .eq("provider", "meta_instagram")
    .maybeSingle();

  if (intErr || !intRow?.active) {
    return NextResponse.json(
      { error: "No active Instagram integration found. Please connect Instagram first." },
      { status: 404 },
    );
  }

  const cfg          = intRow.config as Record<string, string>;
  const igAccountId  = cfg.instagram_business_account_id;
  const userTokenEnc = cfg.user_access_token_enc;   // user/system-user token (needed for IG API)
  const pageTokenEnc = cfg.access_token_enc;         // page token (fallback, may not work)

  if (!igAccountId) {
    return NextResponse.json(
      { error: "Missing instagram_business_account_id in stored config. Please reconnect Instagram." },
      { status: 400 },
    );
  }

  // Prefer the user/system-user token. Fall back to page token with a warning.
  // If neither is present, require reconnect.
  const tokenEnc = userTokenEnc ?? pageTokenEnc;
  if (!tokenEnc) {
    return NextResponse.json(
      { error: "Missing access token in stored config. Please reconnect Instagram." },
      { status: 400 },
    );
  }

  if (!userTokenEnc) {
    console.warn(
      `[meta-resubscribe] user_access_token_enc not stored for org=${params.orgId}. ` +
      `Falling back to page token — this may fail with error (#3). Reconnect Instagram to fix.`,
    );
  }

  let token: string;
  try {
    token = decryptSecret(tokenEnc);
  } catch (e) {
    return NextResponse.json(
      { error: `Token decrypt failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  try {
    await subscribeIgToWebhooks(igAccountId, token);
    const tokenType = userTokenEnc ? "user/system-user" : "page (fallback — reconnect for best results)";
    console.log(`[meta-resubscribe] ✓ subscription created ig=${igAccountId} token_type=${tokenType} org=${params.orgId}`);
    return NextResponse.json({
      ok:            true,
      ig_account_id: igAccountId,
      ig_username:   cfg.ig_username ?? "(unknown)",
      token_type:    tokenType,
      message:       "Instagram webhook subscription created. DMs will be delivered to your inbox.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[meta-resubscribe] subscription failed:", msg);

    // If error contains (#3), the token type is wrong — page token used instead of user token
    const isCapabilityError = msg.includes("(#3)") || msg.toLowerCase().includes("capability");
    return NextResponse.json({
      error: msg,
      hint: isCapabilityError
        ? "Error (#3) means the token type is wrong. Reconnect Instagram via OAuth to store a fresh user/system-user token, then retry."
        : undefined,
    }, { status: 502 });
  }
}
