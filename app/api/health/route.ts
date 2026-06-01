/**
 * GET /api/health
 * Uptime monitoring probe. Returns 200 with timestamp and env-var status.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const smtpUser = process.env.SMTP_USER ?? process.env.BREVO_SMTP_USER ?? "";
  const smtpPass = process.env.SMTP_PASS ?? process.env.BREVO_SMTP_PASS ?? "";

  return NextResponse.json({
    ok:   true,
    time: new Date().toISOString(),
    email: {
      configured: !!(smtpUser && smtpPass),
      user:       smtpUser ? `${smtpUser.slice(0, 6)}…` : "MISSING — set SMTP_USER or BREVO_SMTP_USER",
      pass:       smtpPass ? `set (length ${smtpPass.length})` : "MISSING — set SMTP_PASS or BREVO_SMTP_PASS",
    },
  });
}
