/**
 * POST /api/auth/magic-link
 *
 * Sends a magic-link sign-in email via Supabase Auth (NOT via our lib/email.ts).
 * Supabase uses the Custom SMTP configured in the Supabase dashboard (Brevo),
 * so this works independently of our BREVO_SMTP_* env vars.
 *
 * Flow:
 *  1. Rate limit + disposable-email check
 *  2. supabase.auth.signInWithOtp() — Supabase generates the link AND sends the email
 *  3. User clicks link → /auth/confirm?token_hash=…&type=magiclink&next=/
 *  4. /auth/confirm verifyOtp → session created → dashboard
 *
 * Previous implementation used admin.generateLink() + lib/email.ts (nodemailer)
 * which required our own BREVO_SMTP_* credentials. Those can differ from the
 * credentials Supabase has configured, causing "535 Authentication failed".
 * Delegating to Supabase avoids this entirely.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const Schema = z.object({
  email:      z.string().email("Invalid email address").max(254),
  redirectTo: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const ip = getIp(req);

  // Rate limit: 10 requests per hour per IP (generous — Supabase enforces its own limits too)
  const rl = await rateLimitAsync(`magic-link:${ip}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait an hour before trying again." },
      { status: 429 }
    );
  }

  const body   = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const { email } = parsed.data;
  console.log("[magic-link] request for:", email.split("@")[1], "| ip:", ip);

  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: "Please use a permanent email address. Disposable email addresses are not accepted." },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app";

  // Collect session cookies (in case Supabase sets any during this call)
  const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => req.cookies.getAll(),
        setAll:  (cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) => {
          pendingCookies.push(...cookiesToSet);
        },
      },
    }
  );

  // Supabase sends the magic-link email via its own configured SMTP (Brevo in dashboard).
  // emailRedirectTo becomes the ?next= param in the /auth/confirm token-hash URL.
  const t0 = Date.now();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo:  `${appUrl}/`,   // where to go after /auth/confirm verifies
      shouldCreateUser: true,           // allow sign-up via magic link for new emails
    },
  });
  console.log(`[magic-link] signInWithOtp took ${Date.now() - t0}ms`, { ok: !error, errorCode: error?.code });

  void logAudit(createServiceClient(), null, null, "auth.magic_link_request", {
    email_domain: email.split("@")[1],
    ip,
    user_agent:   req.headers.get("user-agent")?.slice(0, 200),
    success:      !error,
    error_code:   error?.code,
  });

  if (error) {
    console.error("[magic-link] signInWithOtp error:", error.message, "| code:", error.code);

    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("rate") || error.status === 429) {
      return NextResponse.json(
        { error: "Too many sign-in emails sent to this address. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }
    if (msg.includes("invalid") || msg.includes("email")) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    // Return Supabase's own message — it's accurate and not an SMTP message
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
