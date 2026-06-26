/**
 * POST /api/auth/signup-password
 * Create account with email + password.
 *
 * Supabase sends the confirmation email via its own configured SMTP (Brevo in dashboard).
 * We do NOT call lib/email.ts here.
 *
 * Rate limit: 10 signups per IP per hour.
 *
 * Three success states from supabase.auth.signUp():
 *  1. data.session present      → email confirmations OFF → user is logged in now
 *  2. data.user.identities = [] → email already registered (Supabase fake-user pattern)
 *  3. data.user, no session     → email confirmations ON  → user must check inbox
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { logAudit } from "@/lib/audit";
import { track, EVENTS } from "@/lib/analytics";
import { z } from "zod";

const Schema = z.object({
  email:    z.string().email().max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export async function POST(req: NextRequest) {
  const ip = getIp(req);

  const rl = await rateLimitAsync(`signup:${ip}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many signup attempts. Try again in 1 hour." }, { status: 429 });
  }

  const body   = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { email, password } = parsed.data;

  if (isDisposableEmail(email)) {
    return NextResponse.json({ error: "Please use a permanent email address." }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.effora.co.in";

  // Collect session cookies to stamp onto the response
  const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => req.cookies.getAll(),
        setAll:  (cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) =>
          pendingCookies.push(...cookiesToSet),
      },
    }
  );

  // emailRedirectTo becomes the ?next= param in the Supabase confirmation email link.
  // Must be a URL in your Supabase project's "Redirect URLs" allowlist.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/auth/confirm?next=/onboarding`,
    },
  });

  void logAudit(createServiceClient(), null, data?.user?.id ?? null, "auth.signup", {
    email_domain: email.split("@")[1],
    ip,
    method:     "email_password",
    success:    !error,
    error_code: error?.code,
  });

  if (error) {
    console.error("[signup-password] Supabase error:", error.message, "| code:", error?.code);

    const msgLower = (error.message ?? "").toLowerCase();
    let clientMsg: string;
    let status = 400;

    if (msgLower.includes("already registered") || msgLower.includes("already exists") || error.code === "user_already_exists") {
      clientMsg = "This email is already registered. Try logging in instead.";
      status = 409;
    } else if (msgLower.includes("rate") || error.status === 429) {
      clientMsg = "Too many sign-up emails sent. Supabase allows 4 confirmation emails/hour on the free tier. Wait a few minutes and try again.";
      status = 429;
    } else {
      clientMsg = error.message;
    }

    return NextResponse.json({ error: clientMsg }, { status });
  }

  // Guard: signUp() should always return a user on success, but be defensive
  if (!data.user) {
    console.error("[signup-password] no user returned and no error — unexpected Supabase state");
    return NextResponse.json({ error: "Signup failed — please try again." }, { status: 500 });
  }

  // ── Supabase "fake user" pattern: email already exists ─────────────────────
  // When the email is already registered, Supabase returns error=null and a
  // fake user object with identities=[] to prevent email enumeration.
  // We must check this explicitly — it will never have a session.
  if (data.user.identities && data.user.identities.length === 0) {
    console.log("[signup-password] identities=[] — email already registered:", email.split("@")[1]);
    return NextResponse.json(
      { error: "This email is already registered. Try logging in instead." },
      { status: 409 }
    );
  }

  // ── Build response and stamp cookies ───────────────────────────────────────
  const response = NextResponse.json(
    data.session
      ? // Email confirmations OFF in Supabase — user is immediately logged in
        { success: true, needsConfirmation: false, message: "Account created. Redirecting…" }
      : // Email confirmations ON — user must verify their inbox
        { success: true, needsConfirmation: true,  message: "Check your email to confirm your account." }
  );

  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));

  void track({ event: EVENTS.USER_SIGNUP, userId: data.user.id, properties: { method: "email_password", needs_confirmation: !data.session } });
  console.log(
    `[signup-password] created user for ${email.split("@")[1]} | session:${!!data.session} needsConfirmation:${!data.session}`
  );
  return response;
}
