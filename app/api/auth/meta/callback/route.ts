/**
 * GET /api/auth/meta/callback?code=...&state=...
 *
 * OAuth callback from Facebook.
 * - Exchanges code for long-lived token
 * - Fetches pages + linked IG accounts
 * - Picks the first IG-linked page (coaches typically have one)
 * - Stores integration row
 * - Subscribes page to webhooks
 * - Redirects to /settings/channel/instagram?connected=1
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMetaConfig } from "@/lib/meta-config";
import {
  exchangeCodeForLongLivedToken,
  fetchPagesWithIg,
  subscribePageToWebhooks,
  saveMetaIntegration,
} from "@/lib/integrations/meta-instagram";

export async function GET(req: NextRequest) {
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app";

  const code       = req.nextUrl.searchParams.get("code");
  const stateRaw   = req.nextUrl.searchParams.get("state");
  const errorParam = req.nextUrl.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(`${appUrl}/settings/channel/instagram?error=oauth_denied`);
  }

  if (!code || !stateRaw) {
    return NextResponse.redirect(`${appUrl}/settings/channel/instagram?error=missing_params`);
  }

  // Decode state
  let orgSlug: string;
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
    orgSlug = decoded.orgSlug;
    userId  = decoded.userId;
  } catch {
    return NextResponse.redirect(`${appUrl}/settings/channel/instagram?error=invalid_state`);
  }

  // Verify the requesting user matches the state
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  // Resolve org
  const svc = createServiceClient();
  const { data: org } = await svc
    .from("orgs").select("id, slug")
    .eq("slug", orgSlug).single();

  if (!org) {
    return NextResponse.redirect(`${appUrl}/settings/channel/instagram?error=org_not_found`);
  }

  // Resolve Meta credentials via the same priority chain as /connect
  // (BYO org creds → platform_settings table → env vars)
  const metaCfg = await getMetaConfig((org as { id: string }).id).catch(() => null);
  if (!metaCfg) {
    return NextResponse.redirect(
      `${appUrl}/org/${orgSlug}/settings/channel/instagram?error=missing_params`,
    );
  }

  const redirectUri = `${appUrl}/api/auth/meta/callback`;

  try {
    const { access_token, expires_at } = await exchangeCodeForLongLivedToken(
      code, redirectUri, metaCfg.app_id, metaCfg.app_secret,
    );

    const pages = await fetchPagesWithIg(access_token);

    if (pages.length === 0) {
      return NextResponse.redirect(
        `${appUrl}/org/${orgSlug}/settings/channel/instagram?error=no_ig_account`,
      );
    }

    // Use the first IG-linked page (the connect flow can be extended later to let coaches pick)
    const page = pages[0];

    await saveMetaIntegration(
      (org as { id: string }).id,
      page.page_id,
      page.page_name,
      page.ig_account_id,
      page.ig_username,
      page.page_token, // store the PAGE token, not user token
      expires_at,
    );

    // Subscribe to webhook events
    try {
      await subscribePageToWebhooks(page.page_id, page.page_token);
    } catch (e) {
      console.error("[meta-callback] webhook subscribe failed (non-fatal):", e);
    }

    return NextResponse.redirect(
      `${appUrl}/org/${orgSlug}/settings/channel/instagram?connected=1`,
    );
  } catch (err) {
    console.error("[meta-callback] error:", err);
    return NextResponse.redirect(
      `${appUrl}/org/${orgSlug}/settings/channel/instagram?error=exchange_failed`,
    );
  }
}
