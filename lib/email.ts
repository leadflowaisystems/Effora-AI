/**
 * lib/email.ts — Brevo SMTP transactional email sender.
 * Uses nodemailer with Brevo SMTP credentials from env.
 * Writes each send to brevo_send_log for quota tracking.
 */

import nodemailer from "nodemailer";
import { createServiceClient } from "@/lib/supabase/server";

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
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return; // silently skip when unconfigured

  const transport = getTransport();
  await transport.sendMail({
    from:    `"${opts.fromName ?? "Effora AI"}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
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
