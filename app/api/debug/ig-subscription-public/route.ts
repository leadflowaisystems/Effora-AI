/**
 * GET /api/debug/ig-subscription-public
 *
 * Temporary PUBLIC diagnostic — NO AUTH.
 * Returns the raw subscribed_apps response for IG account 17841424594812508.
 * REMOVE immediately after debugging is complete.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";

const GRAPH   = "https://graph.facebook.com/v18.0";
const IG_ACCT = "17841424594812508";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const svc = createServiceClient();

  // Load first active meta_instagram integration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: integration, error: dbErr } = await (svc as any)
    .from("integrations")
    .select("org_id, config")
    .eq("provider", "meta_instagram")
    .eq("active", true)
    .maybeSingle();

  if (dbErr || !integration) {
    return NextResponse.json({
      error:  "No active meta_instagram integration found",
      detail: dbErr?.message ?? null,
    }, { status: 404 });
  }

  const cfg = integration.config as Record<string, string>;

  if (!cfg.user_access_token_enc) {
    return NextResponse.json({
      error:       "user_access_token_enc missing from integration config",
      config_keys: Object.keys(cfg),
    }, { status: 400 });
  }

  let userToken: string;
  try {
    userToken = decryptSecret(cfg.user_access_token_enc);
  } catch (e) {
    return NextResponse.json({
      error:  "Failed to decrypt user_access_token_enc",
      detail: String(e),
    }, { status: 500 });
  }

  const url = new URL(`${GRAPH}/${IG_ACCT}/subscribed_apps`);
  url.searchParams.set("access_token", userToken);

  const metaRes  = await fetch(url.toString());
  const metaJson = await metaRes.json();

  return NextResponse.json(metaJson);
}
