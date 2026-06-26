/**
 * POST /api/admin/email-diagnostic
 *
 * Full Brevo SMTP diagnostic: tests connection AND actual send, then returns
 * a plain-English conclusion explaining exactly what's broken.
 *
 * Usage:
 *   curl -X POST https://www.effora.co.in/api/admin/email-diagnostic \
 *     -H "Content-Type: application/json" \
 *     -d '{"adminEmail":"you@example.com","testTo":"you@example.com"}'
 *
 * NOTE: This endpoint checks the adminEmail against ADMIN_EMAILS env var.
 *       It does NOT require a browser session, so it can be called from curl.
 *       Only share the endpoint with trusted admins.
 *
 * Env vars checked (all from lib/email.ts which is the actual sender):
 *   SMTP_USER     — Brevo SMTP login (your Brevo account email)
 *   SMTP_PASS     — Brevo SMTP master key (NOT your login password)
 *   SMTP_FROM     — From address (optional, defaults to SMTP_USER)
 *   SMTP_HOST     — defaults to smtp-relay.brevo.com
 *   SMTP_PORT     — defaults to 587
 */

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // ── Admin gate (email-based, no session required so curl works) ──
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

    let body: { adminEmail?: string; testTo?: string } = {};
    try { body = await req.json(); } catch { /* empty */ }

    const { adminEmail, testTo } = body;

    if (!adminEmail || !adminEmails.includes(adminEmail.toLowerCase())) {
      return NextResponse.json({ error: "Not admin — provide adminEmail matching ADMIN_EMAILS env var" }, { status: 403 });
    }
    if (!testTo) {
      return NextResponse.json({ error: "testTo email address required" }, { status: 400 });
    }

    // ── Surface env vars (values masked) ─────────────────────────
    const smtpUser = process.env.SMTP_USER ?? "";
    const smtpPass = process.env.SMTP_PASS ?? "";
    const smtpFrom = process.env.SMTP_FROM ?? smtpUser;
    const smtpHost = process.env.SMTP_HOST ?? "smtp-relay.brevo.com";
    const smtpPort = Number(process.env.SMTP_PORT ?? 587);

    const envCheck = {
      SMTP_USER: smtpUser ? `SET (${smtpUser.slice(0, 8)}...)` : "MISSING ← set this in Vercel env vars",
      SMTP_PASS: smtpPass ? `SET (length: ${smtpPass.length})` : "MISSING ← set this in Vercel env vars",
      SMTP_FROM: smtpFrom || "MISSING (will use SMTP_USER)",
      SMTP_HOST: smtpHost,
      SMTP_PORT: smtpPort,
      ADMIN_EMAILS: adminEmails.length > 0 ? `${adminEmails.length} address(es)` : "MISSING",
    };

    if (!smtpUser || !smtpPass) {
      return NextResponse.json({
        envCheck,
        transportResult: { connected: false, error: "SMTP_USER or SMTP_PASS not set" },
        sendResult:      { success: false, messageId: null, error: null, brevoResponse: null },
        conclusion: "MISSING ENV VARS: Set SMTP_USER and SMTP_PASS in Vercel → Project Settings → " +
                    "Environment Variables. Get fresh SMTP credentials at: " +
                    "https://app.brevo.com/settings/keys/smtp",
      });
    }

    // ── Step 1: verify SMTP connection ───────────────────────────
    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: false,
      auth:   { user: smtpUser, pass: smtpPass },
    });

    const transportResult: { connected: boolean; error: string | null } = { connected: false, error: null };

    try {
      await transporter.verify();
      transportResult.connected = true;
    } catch (verifyErr) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      transportResult.error = msg;
      return NextResponse.json({
        envCheck,
        transportResult,
        sendResult:  { success: false, messageId: null, error: null, brevoResponse: null },
        conclusion:  "SMTP CONNECTION FAILED: " + msg + ". " +
                     "Most likely SMTP_PASS is wrong. Generate a new SMTP key (not your login password) at: " +
                     "https://app.brevo.com/settings/keys/smtp",
      });
    }

    // ── Step 2: attempt actual send ───────────────────────────────
    const sendResult: { success: boolean; messageId: string | null; error: string | null; brevoResponse: string | null } = {
      success: false, messageId: null, error: null, brevoResponse: null,
    };

    try {
      const info = await transporter.sendMail({
        from:    `"Effora AI Diagnostic" <${smtpFrom}>`,
        to:      testTo,
        subject: "Effora AI — SMTP Diagnostic Test",
        html: `
          <div style="font-family:sans-serif;max-width:480px;padding:24px">
            <h2 style="margin:0 0 8px">✓ Brevo SMTP is working</h2>
            <p style="color:#555">If you received this, end-to-end email delivery is confirmed.</p>
            <p style="font-size:12px;color:#888">Sent: ${new Date().toISOString()}</p>
            <pre style="font-size:11px;background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto">
SMTP_HOST: ${smtpHost}
SMTP_PORT: ${smtpPort}
SMTP_USER: ${smtpUser.slice(0, 8)}...
SMTP_FROM: ${smtpFrom}
            </pre>
          </div>
        `,
      });
      sendResult.success      = true;
      sendResult.messageId    = info.messageId;
      sendResult.brevoResponse = info.response;
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      sendResult.error = msg;
    }

    // ── Step 3: plain-English conclusion ─────────────────────────
    let conclusion: string;
    if (sendResult.success) {
      conclusion = `✓ OK — email sent to ${testTo}. Check inbox AND spam. If not arrived in 2 min, ` +
                   "check Brevo activity log: https://app.brevo.com/log/email";
    } else {
      const err = sendResult.error ?? "";
      if (err.includes("not allowed") || err.includes("unverified") || err.includes("Sender")) {
        conclusion = "SENDER NOT VERIFIED: The From address (" + smtpFrom + ") is not verified in Brevo. " +
                     "Go to https://app.brevo.com/senders/list and verify it.";
      } else if (err.toLowerCase().includes("rate") || err.includes("too many") || err.includes("quota")) {
        conclusion = "RATE LIMITED: Brevo free tier allows 300 emails/day. " +
                     "Check usage at https://app.brevo.com/statistics/email";
      } else {
        conclusion = "SEND FAILED: " + err;
      }
    }

    return NextResponse.json({ envCheck, transportResult, sendResult, conclusion });

  } catch (err) {
    return NextResponse.json(
      { fatal: err instanceof Error ? err.message : "Unknown fatal error" },
      { status: 500 }
    );
  }
}
