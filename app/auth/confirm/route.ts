/**
 * GET /auth/confirm
 *
 * Handles Supabase email-link verification for all OTP types:
 *   - signup          → confirm email, then go to dashboard / next
 *   - recovery        → confirm reset token, then ALWAYS go to /reset/update
 *   - email_change    → confirm new email, then go to next
 *   - invite          → confirm invite, then go to next
 *   - magiclink       → verify magic-link OTP, then go to next
 *
 * Supabase templates send links in the form:
 *   https://your-app.com/auth/confirm?token_hash=…&type=…&next=…
 *
 * Cookie strategy: collect cookies from verifyOtp into an array and stamp
 * them onto the returned redirect — same pattern used in signin-password
 * to guarantee Set-Cookie is present regardless of Next.js version quirks.
 */

import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const token_hash = searchParams.get("token_hash");
  const type       = searchParams.get("type") as EmailOtpType | null;
  const next       = searchParams.get("next") ?? "/";

  // ── Validate params ────────────────────────────────────────────────────────
  if (!token_hash || !type) {
    console.warn("[auth/confirm] missing token_hash or type — bad link");
    return NextResponse.redirect(
      new URL("/login?error=Invalid+confirmation+link", origin)
    );
  }

  // ── Build Supabase client with explicit cookie collection ──────────────────
  const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // Block body returns void instead of the number returned by Array.push().
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) => {
          pendingCookies.push(...cookiesToSet);
        },
      },
    }
  );

  // ── Exchange the OTP hash for a session ────────────────────────────────────
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    console.error("[auth/confirm] verifyOtp error:", error.message, "| type:", type);
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(
          error.message.includes("expired") || error.message.includes("invalid")
            ? "Confirmation link has expired. Please request a new one."
            : error.message
        )}`,
        origin
      )
    );
  }

  console.log("[auth/confirm] verifyOtp OK | type:", type, "| cookies set:", pendingCookies.map((c) => c.name));

  // ── Determine redirect destination ─────────────────────────────────────────
  // Recovery MUST go to /reset/update so the user can set their new password.
  // Never redirect a recovery session to the dashboard.
  let destination: string;
  if (type === "recovery") {
    destination = `${origin}/reset/update`;
  } else {
    // For signup / magic-link / email_change / invite:
    // honour the `next` param if it's a safe relative path, else go home.
    destination = next.startsWith("/") ? `${origin}${next}` : origin;
  }

  // ── Build redirect response and stamp session cookies onto it ──────────────
  const response = NextResponse.redirect(destination);
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );

  return response;
}
