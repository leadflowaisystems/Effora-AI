/**
 * POST /api/orgs/[orgId]/integrations/meta-instagram/resubscribe
 *
 * Re-triggers the Instagram webhook subscription using the credentials
 * already stored in the integrations table. Useful after a code deploy
 * that fixes the subscription endpoint (from page-ID to IG-account-ID)
 * without requiring a full re-OAuth.
 *
 * Uses the stored page token + ig_account_id to call:
 *   POST /v18.0/{ig_account_id}/subscribed_apps?subscribed_fields=messages&access_token=TOKEN
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

  const cfg = intRow.config as Record<string, string>;
  const igAccountId = cfg.instagram_business_account_id;
  const tokenEnc    = cfg.access_token_enc;

  if (!igAccountId) {
    return NextResponse.json(
      { error: "Missing instagram_business_account_id in stored config." },
      { status: 400 },
    );
  }

  if (!tokenEnc) {
    return NextResponse.json(
      { error: "Missing access_token_enc in stored config. Please reconnect Instagram." },
      { status: 400 },
    );
  }

  let pageToken: string;
  try {
    pageToken = decryptSecret(tokenEnc);
  } catch (e) {
    return NextResponse.json(
      { error: `Token decrypt failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  try {
    await subscribeIgToWebhooks(igAccountId, pageToken);
    console.log(`[meta-resubscribe] ✓ IG webhook subscription created for ig=${igAccountId} org=${params.orgId}`);
    return NextResponse.json({
      ok: true,
      ig_account_id: igAccountId,
      message: "Instagram webhook subscription created successfully. DMs will now be delivered.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[meta-resubscribe] subscription failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
