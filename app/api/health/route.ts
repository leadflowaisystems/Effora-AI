/**
 * GET /api/health
 * Uptime monitoring probe. Returns 200 with timestamp and env-var status.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  // NOTE: Never expose any credential values, usernames, or length hints here.
  // This endpoint is public (used by uptime monitors) — only booleans allowed.
  const smtpUser = process.env.SMTP_USER ?? process.env.BREVO_SMTP_USER ?? "";
  const smtpPass = process.env.SMTP_PASS ?? process.env.BREVO_SMTP_PASS ?? "";

  return NextResponse.json({
    ok:   true,
    time: new Date().toISOString(),
    email: {
      configured: !!(smtpUser && smtpPass),
    },
  });
}
