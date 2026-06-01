/**
 * GET /api/auth/meta/connect?orgSlug=...
 *
 * Generates the Facebook OAuth URL and redirects the coach.
 * Passes orgSlug through state so the callback can associate the token with the right org.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getMetaConfig }             from "@/lib/meta-config";

const SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
].join(",");

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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app";
    return NextResponse.redirect(
      new URL(
        `/org/${orgSlug}/health?error=meta_not_configured`,
        appUrl,
      ).toString()
    );
  }

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app";
  const redirectUri = `${appUrl}/api/auth/meta/callback`;

  // Encode orgSlug + userId in state so callback can verify and associate
  const state = Buffer.from(JSON.stringify({ orgSlug, userId: user.id })).toString("base64url");

  const oauthUrl = new URL("https://www.facebook.com/v18.0/dialog/oauth");
  oauthUrl.searchParams.set("client_id",     metaCfg.app_id);
  oauthUrl.searchParams.set("redirect_uri",  redirectUri);
  oauthUrl.searchParams.set("scope",         SCOPES);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state",         state);

  return NextResponse.redirect(oauthUrl.toString());
}
