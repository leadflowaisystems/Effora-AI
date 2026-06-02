/**
 * POST /api/admin/email-test
 *
 * Deep Brevo SMTP diagnostic that checks both BREVO_* and SMTP_* env vars,
 * verifies the SMTP connection, and attempts an actual send.
 * Returns the full, unsanitised error so the root cause is immediately visible.
 *
 * Auth: caller must supply { adminEmail } matching ADMIN_EMAILS env var.
 *       No browser session needed — safe to call with curl.
 *
 * curl example:
 *   curl -X POST https://effora-ai-qh35.vercel.app/api/admin/email-test \
 *     -H "Content-Type: application/json" \
 *     -d '{"adminEmail":"you@example.com","testTo":"you@example.com"}'
 */

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // ── Admin gate ─────────────────────────────────────────────────────────────
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

    let body: { adminEmail?: string; testTo?: string } = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const { adminEmail, testTo } = body;

    if (!adminEmail || !adminEmails.includes(adminEmail.toLowerCase())) {
      return NextResponse.json(
        { error: "Not admin — provide adminEmail matching ADMIN_EMAILS env var" },
        { status: 403 },
      );
    }
    if (!testTo) {
      return NextResponse.json({ error: "testTo email address required" }, { status: 400 });
    }

    // ── Resolve credentials: BREVO_* takes priority, SMTP_* as fallback ────────
    // This mirrors the exact resolution order in lib/email.ts.
    const hasBrevoUser = !!process.env.BREVO_SMTP_USER;
    const hasBrevoPass = !!process.env.BREVO_SMTP_PASS;
    const hasSmtpUser  = !!process.env.SMTP_USER;
    const hasSmtpPass  = !!process.env.SMTP_PASS;

    const smtpUser = process.env.SMTP_USER ?? process.env.BREVO_SMTP_USER ?? "";
    const smtpPass = process.env.SMTP_PASS ?? process.env.BREVO_SMTP_PASS ?? "";
    const fromEmail =
      process.env.SMTP_FROM ?? process.env.BREVO_FROM_EMAIL ?? smtpUser;
    const smtpHost = process.env.SMTP_HOST ?? "smtp-relay.brevo.com";
    const smtpPort = Number(process.env.SMTP_PORT ?? 587);

    const envCheck = {
      // BREVO_* vars
      BREVO_SMTP_USER:  hasBrevoUser
        ? `SET (${(process.env.BREVO_SMTP_USER ?? "").slice(0, 10)}...)`
        : "MISSING",
      BREVO_SMTP_PASS:  hasBrevoPass
        ? `SET (length: ${(process.env.BREVO_SMTP_PASS ?? "").length})`
        : "MISSING",
      BREVO_FROM_EMAIL: process.env.BREVO_FROM_EMAIL ?? "MISSING",

      // SMTP_* vars (lib/email.ts prefers these when set)
      SMTP_USER: hasSmtpUser
        ? `SET (${(process.env.SMTP_USER ?? "").slice(0, 10)}...)`
        : "not set",
      SMTP_PASS: hasSmtpPass
        ? `SET (length: ${(process.env.SMTP_PASS ?? "").length})`
        : "not set",
      SMTP_FROM: process.env.SMTP_FROM ?? "not set",
      SMTP_HOST: smtpHost,
      SMTP_PORT: smtpPort,

      // Resolved values that will actually be used
      resolvedUser: smtpUser ? `${smtpUser.slice(0, 10)}...` : "EMPTY — no credentials found",
      resolvedFrom: fromEmail || "EMPTY",
      ADMIN_EMAILS: adminEmails.length ? `${adminEmails.length} address(es)` : "MISSING",
    };

    if (!smtpUser || !smtpPass) {
      return NextResponse.json({
        envCheck,
        verifySuccess: false,
        verifyError:   "Cannot attempt — SMTP credentials are empty. Set BREVO_SMTP_USER + BREVO_SMTP_PASS (or SMTP_USER + SMTP_PASS) in Vercel → Project Settings → Environment Variables. Get SMTP credentials at https://app.brevo.com/settings/keys/smtp",
        sendSuccess:   false,
        sendError:     null,
        brevoResponse: null,
        conclusion:    "ROOT CAUSE: No SMTP credentials in environment. Add BREVO_SMTP_USER and BREVO_SMTP_PASS.",
      });
    }

    // ── Step 1: verify SMTP connection ─────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: false,
      auth:   { user: smtpUser, pass: smtpPass },
    });

    let verifySuccess = false;
    let verifyError: string | null = null;

    try {
      await transporter.verify();
      verifySuccess = true;
    } catch (verifyErr) {
      verifyError = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      return NextResponse.json({
        envCheck,
        verifySuccess,
        verifyError,
        sendSuccess:   false,
        sendError:     null,
        brevoResponse: null,
        conclusion:    "ROOT CAUSE: SMTP connection failed — " + verifyError +
                       ". Most likely BREVO_SMTP_PASS is the wrong key (must be SMTP key, NOT your Brevo login password). " +
                       "Generate a new one at https://app.brevo.com/settings/keys/smtp",
      });
    }

    // ── Step 2: attempt actual send ────────────────────────────────────────────
    let sendSuccess = false;
    let sendError: string | null = null;
    let brevoResponse: string | null = null;

    try {
      const info = await transporter.sendMail({
        from:    `"Effora AI Diagnostic" <${fromEmail}>`,
        to:      testTo,
        subject: "Effora AI — SMTP Diagnostic Test",
        html: `
          <div style="font-family:sans-serif;max-width:480px;padding:24px">
            <h2 style="margin:0 0 8px">SMTP working</h2>
            <p style="color:#555">End-to-end email delivery confirmed.</p>
            <p style="font-size:12px;color:#888">Sent: ${new Date().toISOString()}</p>
            <pre style="font-size:11px;background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto">
SMTP_HOST: ${smtpHost}
SMTP_PORT: ${smtpPort}
resolvedUser: ${smtpUser.slice(0, 10)}...
resolvedFrom: ${fromEmail}
            </pre>
          </div>
        `,
      });
      sendSuccess    = true;
      brevoResponse  = info.response ?? null;
    } catch (sendErr) {
      sendError = sendErr instanceof Error ? sendErr.message : String(sendErr);
    }

    // ── Step 3: conclusion ─────────────────────────────────────────────────────
    let conclusion: string;
    if (sendSuccess) {
      conclusion =
        `OK — email dispatched to ${testTo}. Check inbox AND spam folder. ` +
        "If not arrived in 2 min, the address may be on Brevo's bounce/blocked list. " +
        "Check the Brevo activity log: https://app.brevo.com/log/email";
    } else {
      const err = sendError ?? "";
      if (/not allowed|unverified|sender/i.test(err)) {
        conclusion =
          "ROOT CAUSE: SENDER NOT VERIFIED — from address (" + fromEmail + ") is not verified in Brevo. " +
          "Go to https://app.brevo.com/senders/list and verify it, OR change BREVO_FROM_EMAIL to an already-verified address.";
      } else if (/rate|too many|quota|limit/i.test(err)) {
        conclusion =
          "ROOT CAUSE: RATE LIMIT / QUOTA — Brevo free tier is 300 emails/day. " +
          "Check usage at https://app.brevo.com/statistics/email";
      } else {
        conclusion = "ROOT CAUSE: SEND FAILED — " + err;
      }
    }

    return NextResponse.json({
      envCheck,
      verifySuccess,
      verifyError,
      sendSuccess,
      sendError,
      brevoResponse,
      conclusion,
    });

  } catch (fatal) {
    return NextResponse.json(
      { fatal: fatal instanceof Error ? fatal.message : "Unknown fatal error" },
      { status: 500 },
    );
  }
}
