/**
 * GET /api/auth/meta/connect?orgSlug=...
 *
 * Generates the Facebook Login for Business OAuth URL and redirects the coach.
 * Uses config_id (not scope=) — the Business Login configuration controls which
 * permissions are requested. This is required for the app's published Business
 * Login setup (config_id 1303123918594190).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getMetaConfig }             from "@/lib/meta-config";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const orgSlug = req.nextUrl.searchParams.get("orgSlug");
  if (!orgSlug) return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });

  // Resolve orgId from slug so we can look up BYO creds
  const { data: orgRow } = await supabase
    .from("orgs")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();

  const orgId  = (orgRow as { id: string } | null)?.id ?? "";
  const metaCfg = await getMetaConfig(orgId).catch(() => null);

  if (!metaCfg) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.effora.co.in";
    return NextResponse.redirect(
      new URL(
        `/org/${orgSlug}/health?error=meta_not_configured`,
        appUrl,
      ).toString()
    );
  }

  if (!metaCfg.config_id) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.effora.co.in";
    return NextResponse.redirect(
      new URL(
        `/org/${orgSlug}/health?error=meta_config_id_missing`,
        appUrl,
      ).toString()
    );
  }

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.effora.co.in";
  const redirectUri = `${appUrl}/api/auth/meta/callback`;

  // Encode orgSlug + userId in state so callback can verify and associate
  const state = Buffer.from(JSON.stringify({ orgSlug, userId: user.id })).toString("base64url");

  // Facebook Login for Business: use config_id instead of scope.
  // The Business Login configuration (config_id) defines which permissions
  // and assets are requested. Do NOT include scope= — it is ignored when
  // config_id is present and causes "Feature unavailable" errors on some app types.
  const oauthUrl = new URL("https://www.facebook.com/v18.0/dialog/oauth");
  oauthUrl.searchParams.set("client_id",     metaCfg.app_id);
  oauthUrl.searchParams.set("config_id",     metaCfg.config_id);
  oauthUrl.searchParams.set("redirect_uri",  redirectUri);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state",         state);

  return NextResponse.redirect(oauthUrl.toString());
}
