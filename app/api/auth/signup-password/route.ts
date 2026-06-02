/**
 * POST /api/auth/signup-password
 * Create account with email + password.
 *
 * Supabase sends the confirmation email via its own configured SMTP (Brevo in dashboard).
 * We do NOT call lib/email.ts here — that avoids any dependency on our BREVO_SMTP_* env vars.
 *
 * Rate limit: 10 signups per IP per hour.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { logAudit } from "@/lib/audit";
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

  // Raised from 3 → 10 per hour (previous limit was too aggressive for normal users)
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
    return NextResponse.json(
      { error: "Please use a permanent email address." },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app";

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

  // Supabase sends the confirmation email via its own configured SMTP.
  // emailRedirectTo becomes the ?next= after /auth/confirm verifies.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/`,   // post-confirm destination (dashboard root)
    },
  });

  void logAudit(createServiceClient(), null, data?.user?.id ?? null, "auth.signup", {
    email_domain: email.split("@")[1],
    ip,
    method:  "email_password",
    success: !error,
    error_code: error?.code,
  });

  if (error) {
    console.error("[signup-password]", error.message, "| code:", error?.code);

    const msg = error.message ?? "";
    const msgLower = msg.toLowerCase();

    let clientMsg: string;
    let status = 400;

    if (msgLower.includes("already registered") || msgLower.includes("already exists") || error.code === "user_already_exists") {
      clientMsg = "An account with this email already exists. Please sign in instead.";
    } else if (msgLower.includes("rate") || error.status === 429) {
      clientMsg = "Too many sign-up emails sent — Supabase allows 4 confirmation emails/hour on the free tier. " +
                  "Wait a few minutes and try again.";
      status = 429;
    } else {
      clientMsg = msg;
    }

    return NextResponse.json({ error: clientMsg }, { status });
  }

  // Build response and stamp any cookies Supabase set (e.g. if email confirm is disabled
  // and a session was created immediately)
  const requiresConfirm = !data?.session;
  const response = NextResponse.json({
    ok:                     true,
    user_id:                data?.user?.id,
    requires_email_confirm: requiresConfirm,
  });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));

  console.log(`[signup-password] user created for ${email.split("@")[1]} | requiresConfirm: ${requiresConfirm}`);
  return response;
}
