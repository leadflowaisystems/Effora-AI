/**
 * GET /api/auth/meta/callback?code=...&state=...
 *
 * OAuth callback from Facebook Login for Business.
 * - Exchanges code for system-user access token (never expires)
 * - Fetches pages + linked IG accounts
 * - Attempts to fetch WhatsApp Business Account (requires WA permissions in config)
 * - Stores integration rows in DB
 * - Subscribes page to webhooks
 * - Redirects to settings page
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMetaConfig } from "@/lib/meta-config";
import {
  exchangeCodeForToken,
  fetchPagesWithIg,
  fetchWABA,
  subscribePageToWebhooks,
  saveMetaIntegration,
  saveWhatsAppIntegration,
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

  const metaCfg = await getMetaConfig((org as { id: string }).id).catch(() => null);
  if (!metaCfg) {
    return NextResponse.redirect(
      `${appUrl}/org/${orgSlug}/settings/channel/instagram?error=missing_params`,
    );
  }

  const redirectUri = `${appUrl}/api/auth/meta/callback`;

  try {
    const { access_token, expires_at } = await exchangeCodeForToken(
      code, redirectUri, metaCfg.app_id, metaCfg.app_secret,
    );

    const pages = await fetchPagesWithIg(access_token);

    if (pages.length === 0) {
      return NextResponse.redirect(
        `${appUrl}/org/${orgSlug}/settings/channel/instagram?error=no_ig_account`,
      );
    }

    const page = pages[0];

    await saveMetaIntegration(
      (org as { id: string }).id,
      page.page_id,
      page.page_name,
      page.ig_account_id,
      page.ig_username,
      page.page_token,
      expires_at,
    );

    // Subscribe to webhook events (non-fatal)
    try {
      await subscribePageToWebhooks(page.page_id, page.page_token);
    } catch (e) {
      console.error("[meta-callback] webhook subscribe failed (non-fatal):", e);
    }

    // Attempt WhatsApp WABA retrieval (non-fatal — requires WA permissions in Business Login config)
    try {
      const waba = await fetchWABA(access_token);
      if (waba) {
        await saveWhatsAppIntegration((org as { id: string }).id, waba, access_token);
        console.log(`[meta-callback] WhatsApp WABA saved: ${waba.waba_id} / ${waba.phone_number}`);
      } else {
        console.log("[meta-callback] No WhatsApp WABA found (permissions may not be in Business Login config)");
      }
    } catch (e) {
      console.error("[meta-callback] WABA fetch failed (non-fatal):", e);
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
