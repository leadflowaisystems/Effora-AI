/**
 * POST /api/auth/magic-link
 *
 * Server-side magic link sender:
 * 1. Rate limit: 5 requests per 15 min per IP
 * 2. Disposable email blocklist
 * 3. Generates link via Supabase Admin API
 * 4. Emails the link via Brevo SMTP (lib/email.ts)
 * 5. Audit log entry
 *
 * NOTE: admin.generateLink generates the URL but does NOT send the email.
 * We send it ourselves via Brevo for full control + SMTP independence.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const Schema = z.object({
  email:      z.string().email("Invalid email address").max(254),
  redirectTo: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const ip = getIp(req);

  // Rate limit: 5 magic-link requests per IP per 15 min
  const rl = await rateLimitAsync(`magic-link:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait 15 minutes before trying again." },
      { status: 429 }
    );
  }

  const body   = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const { email, redirectTo } = parsed.data;
  console.log("[magic-link] request for:", email, "| ip:", ip);

  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: "Please use a permanent email address. Disposable email addresses are not accepted." },
      { status: 400 }
    );
  }

  const svc    = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app";
  const cbUrl  = redirectTo ?? `${appUrl}/auth/callback`;

  // Generate the magic link URL (does NOT send email — we send it below via Brevo)
  const t0 = Date.now();
  const { data: linkData, error } = await svc.auth.admin.generateLink({
    type:    "magiclink",
    email,
    options: { redirectTo: cbUrl },
  });
  console.log(`[magic-link] generateLink took ${Date.now() - t0}ms`, { ok: !error, error: error?.message });

  void logAudit(svc, null, null, "auth.magic_link_request", {
    email_domain: email.split("@")[1],
    ip,
    user_agent:   req.headers.get("user-agent")?.slice(0, 200),
    success:      !error,
  });

  if (error || !linkData?.properties?.action_link) {
    console.error("[magic-link] Supabase generateLink error:", error?.message);
    return NextResponse.json(
      { error: "Could not generate magic link. Please try again or use email/password." },
      { status: 500 }
    );
  }

  const actionLink = linkData.properties.action_link;
  console.log(`[magic-link] action_link ready, firing email async (total so far: ${Date.now() - t0}ms)`);

  // Fire email in background — do NOT await. Return 200 immediately.
  // Brevo SMTP delivery is async; user already has the link queued server-side.
  void sendEmail({
    to:       email,
    subject:  "Sign in to Effora AI",
    template: "magic_link",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Sign in to Effora AI</h2>
        <p style="color:#555;margin-bottom:24px">Click the button below to sign in. This link expires in 1 hour.</p>
        <a href="${actionLink}"
           style="display:inline-block;background:#C1F15C;color:#0A0A0C;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">
          Sign in to Effora AI →
        </a>
        <p style="color:#999;font-size:12px;margin-top:32px">
          Or copy this link:<br/>
          <a href="${actionLink}" style="color:#888;word-break:break-all">${actionLink}</a>
        </p>
        <p style="color:#ccc;font-size:11px;margin-top:16px">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  }).then(() => console.log("[magic-link] email sent to:", email))
    .catch((e) => console.error("[magic-link] Brevo send failed (non-fatal):", e));

  console.log(`[magic-link] returning 200 at ${Date.now() - t0}ms`);
  return NextResponse.json({ ok: true });
}
