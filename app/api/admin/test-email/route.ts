/**
 * POST /api/admin/test-email
 * Sends a test email via Brevo SMTP. Admin-only.
 * Body: { to: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const Schema = z.object({ to: z.string().email() });

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body   = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

  const { to } = parsed.data;

  // Check env vars
  const envCheck = {
    SMTP_HOST:    process.env.SMTP_HOST     ?? "(not set — defaults to smtp-relay.brevo.com)",
    SMTP_PORT:    process.env.SMTP_PORT     ?? "(not set — defaults to 587)",
    SMTP_USER:    process.env.SMTP_USER     ? "✓ set" : "✗ MISSING",
    SMTP_PASS:    process.env.SMTP_PASS     ? "✓ set" : "✗ MISSING",
    SMTP_FROM:    process.env.SMTP_FROM     ?? "(not set — uses SMTP_USER)",
    APP_URL:      process.env.NEXT_PUBLIC_APP_URL ?? "(not set)",
  };

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({
      success: false,
      error:   "SMTP_USER or SMTP_PASS env var is missing. Configure Brevo SMTP in Vercel.",
      env:     envCheck,
    }, { status: 500 });
  }

  try {
    await sendEmail({
      to,
      subject:  "Effora AI SMTP test",
      template: "test",
      html: `
        <div style="font-family:sans-serif;padding:24px">
          <h2>Effora AI SMTP test ✓</h2>
          <p>If you're reading this, Brevo SMTP is configured correctly.</p>
          <p style="font-size:12px;color:#888">Sent at: ${new Date().toUTCString()}</p>
          <pre style="font-size:11px;background:#f5f5f5;padding:12px;border-radius:6px">${JSON.stringify(envCheck, null, 2)}</pre>
        </div>
      `,
    });
    return NextResponse.json({ success: true, sent_to: to, env: envCheck });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error:   err instanceof Error ? err.message : String(err),
      env:     envCheck,
    }, { status: 500 });
  }
}
