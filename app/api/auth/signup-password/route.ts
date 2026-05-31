/**
 * POST /api/auth/signup-password
 * Create account with email + password.
 * Rate limit: 3 signups per IP per hour.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
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

  const rl = await rateLimitAsync(`signup:${ip}`, { limit: 3, windowMs: 60 * 60_000 });
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

  // Use SSR client — sets session cookies automatically
  const supabase = createClient();
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai.vercel.app";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${appUrl}/auth/callback` },
  });

  const svc = createServiceClient();

  void logAudit(svc, null, data?.user?.id ?? null, "auth.signup", {
    email_domain: email.split("@")[1],
    ip,
    method: "email_password",
    success: !error,
  });

  if (error) {
    console.error("[signup-password]", error.message);
    const msg = error.message.includes("already registered")
      ? "An account with this email already exists. Please sign in instead."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Send welcome email
  void sendEmail({
    to:       email,
    subject:  "Welcome to Effora AI",
    template: "welcome",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Welcome to Effora AI 🎉</h2>
        <p style="color:#555;margin-bottom:24px">
          Your account is ready. Sign in and set up your workspace to start converting leads on autopilot.
        </p>
        <a href="${appUrl}/login"
           style="display:inline-block;background:#C1F15C;color:#0A0A0C;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none">
          Open Effora AI →
        </a>
      </div>
    `,
  }).catch(() => null);

  const requiresConfirm = !data?.session; // if no session, email confirm required
  return NextResponse.json({
    ok:                   true,
    user_id:              data?.user?.id,
    requires_email_confirm: requiresConfirm,
  });
}
