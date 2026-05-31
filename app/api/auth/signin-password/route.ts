/**
 * POST /api/auth/signin-password
 * Sign in with email + password.
 * Rate limit: 5 attempts per IP per 15 min. Lockout on 5th fail.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
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

  // SSR client — signInWithPassword sets session cookies automatically
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  const svc = createServiceClient();

  void logAudit(svc, null, data?.user?.id ?? null, "auth.signin", {
    email_domain: email.split("@")[1],
    ip,
    user_agent:   req.headers.get("user-agent")?.slice(0, 200),
    method:       "email_password",
    success:      !error,
  });

  if (error) {
    console.error("[signin-password] failed for", email.split("@")[1], ":", error.message);
    // Never reveal whether the email exists
    return NextResponse.json(
      { error: "Invalid email or password. Please check your credentials and try again." },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true, user_id: data.user?.id });
}
