/**
 * lib/email.ts — Brevo SMTP transactional email sender.
 * Uses nodemailer with Brevo SMTP credentials from env.
 * Writes each send to brevo_send_log for quota tracking.
 */

import nodemailer from "nodemailer";
import { createServiceClient } from "@/lib/supabase/server";

// ── Env-var resolution ────────────────────────────────────────────────────────
// Support both SMTP_* (canonical) and BREVO_SMTP_* / BREVO_FROM_* aliases so
// that Vercel projects configured with either naming convention work out of the box.
function smtpUser() {
  return process.env.SMTP_USER ?? process.env.BREVO_SMTP_USER ?? "";
}
function smtpPass() {
  return process.env.SMTP_PASS ?? process.env.BREVO_SMTP_PASS ?? "";
}
function smtpFrom() {
  return (
    process.env.SMTP_FROM ??
    process.env.BREVO_FROM_EMAIL ??
    smtpUser()
  );
}
function smtpFromName() {
  return process.env.BREVO_FROM_NAME ?? "Effora AI";
}

// Pooled SMTP transport — keeps connections warm so sends are ~instant (no TLS handshake per message)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _transport: any | null = null;
function getTransport() {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host:            process.env.SMTP_HOST ?? "smtp-relay.brevo.com",
      port:            Number(process.env.SMTP_PORT ?? 587),
      secure:          false,
      pool:            true,
      maxConnections:  5,
      maxMessages:     100,
      rateDelta:       1000,
      rateLimit:       10,
      auth: {
        user: smtpUser(),
        pass: smtpPass(),
      },
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _transport!;
}

interface SendOptions {
  to:        string;
  subject:   string;
  html:      string;
  fromName?: string;
  orgId?:    string;
  leadId?:   string;
  template?: string;
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  if (!smtpUser() || !smtpPass()) return; // silently skip when unconfigured

  const transport = getTransport();
  await transport.sendMail({
    from:    `"${opts.fromName ?? smtpFromName()}" <${smtpFrom()}>`,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
  });

  // Log for quota tracking (table added in migration 011 — cast to bypass stale types)
  try {
    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (svc as any).from("brevo_send_log").insert({
      org_id:        opts.orgId    ?? null,
      lead_id:       opts.leadId   ?? null,
      template_name: opts.template ?? "unknown",
      sent_at:       new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}
