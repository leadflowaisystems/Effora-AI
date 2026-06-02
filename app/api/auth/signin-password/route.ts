/**
 * POST /api/auth/signin-password
 * Sign in with email + password.
 * Rate limit: 5 attempts per IP per 15 min. Lockout on 5th fail.
 *
 * Cookie strategy: we collect the cookies Supabase wants to set into an array,
 * then write them directly onto the returned NextResponse so they are
 * guaranteed to be present in the Set-Cookie header regardless of Next.js
 * version quirks with cookies() from next/headers inside Route Handlers.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const Schema = z.object({
  email:    z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  const ip = getIp(req);

  // Rate limit: 5 attempts per 15 min per IP
  const rl = await rateLimitAsync(`signin:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait 15 minutes and try again." },
      { status: 429 }
    );
  }

  const body   = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // Collect cookies so we can write them onto the response explicitly.
  // This is the most reliable pattern for Next.js Route Handlers — it
  // avoids any ambiguity about whether cookies().set() writes to the
  // response before NextResponse.json() is created.
  const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => req.cookies.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) =>
          pendingCookies.push(...cookiesToSet),
      },
    }
  );

  const t0 = Date.now();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  console.log(`[signin-password] signInWithPassword took ${Date.now() - t0}ms`, { ok: !error, errorCode: error?.code });

  const svc = createServiceClient();
  void logAudit(svc, null, data?.user?.id ?? null, "auth.signin", {
    email_domain: email.split("@")[1],
    ip,
    user_agent:   req.headers.get("user-agent")?.slice(0, 200),
    method:       "email_password",
    success:      !error,
    error_code:   error?.code,
  });

  if (error) {
    console.error("[signin-password] Supabase error for", email.split("@")[1], ":", error.message, "| code:", error.code);

    // Surface specific Supabase error codes so the user knows what to do
    const code = error.code ?? "";
    const msg  = error.message?.toLowerCase() ?? "";

    let clientMsg: string;
    let status = 401;

    if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
      clientMsg = "Please confirm your email before signing in. Check your inbox for a confirmation link.";
      status = 403;
    } else if (code === "invalid_credentials" || msg.includes("invalid login") || msg.includes("invalid credentials")) {
      clientMsg = "Invalid email or password. Please check your credentials and try again.";
    } else if (code === "user_not_found" || msg.includes("user not found")) {
      // Keep generic to avoid email enumeration
      clientMsg = "Invalid email or password. Please check your credentials and try again.";
    } else if (code === "too_many_requests" || msg.includes("rate")) {
      clientMsg = "Too many attempts — please wait a few minutes before trying again.";
      status = 429;
    } else {
      clientMsg = "Sign in failed. Please try again or use the magic link option.";
    }

    return NextResponse.json({ error: clientMsg, error_code: code }, { status });
  }

  // Build the success response and stamp all session cookies onto it
  const response = NextResponse.json({ ok: true, user_id: data.user?.id });
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  console.log(`[signin-password] session set, cookies: ${pendingCookies.map((c) => c.name).join(", ")}`);
  return response;
}
