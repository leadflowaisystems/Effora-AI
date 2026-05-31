/**
 * GET /api/auth/meta/connect?orgSlug=...
 *
 * Generates the Facebook OAuth URL and redirects the coach.
 * Passes orgSlug through state so the callback can associate the token with the right org.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const appId      = process.env.META_APP_ID;
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai.vercel.app";
  const redirectUri = `${appUrl}/api/auth/meta/callback`;

  if (!appId) {
    return NextResponse.json({ error: "Meta app not configured" }, { status: 500 });
  }

  // Encode orgSlug + userId in state so callback can verify and associate
  const state = Buffer.from(JSON.stringify({ orgSlug, userId: user.id })).toString("base64url");

  const oauthUrl = new URL("https://www.facebook.com/v18.0/dialog/oauth");
  oauthUrl.searchParams.set("client_id",     appId);
  oauthUrl.searchParams.set("redirect_uri",  redirectUri);
  oauthUrl.searchParams.set("scope",         SCOPES);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state",         state);

  return NextResponse.redirect(oauthUrl.toString());
}
