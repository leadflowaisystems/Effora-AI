/**
 * POST /api/support/contact
 * Sends a support message to leadflowai.systems@gmail.com via Brevo.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const Schema = z.object({
  name:    z.string().max(100).optional(),
  email:   z.string().email(),
  subject: z.string().max(200).optional(),
  message: z.string().min(1).max(5000),
});

const SUPPORT_EMAIL = "leadflowai.systems@gmail.com";

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { name, email, subject, message } = parsed.data;

  try {
    await sendEmail({
      to:      SUPPORT_EMAIL,
      subject: `[Effora Support] ${subject ?? "Contact form"} — ${name ?? email}`,
      html: `
        <p><strong>From:</strong> ${name ?? "Unknown"} &lt;${email}&gt;</p>
        <p><strong>Subject:</strong> ${subject ?? "Contact form"}</p>
        <hr />
        <p style="white-space:pre-wrap">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      `,
      orgId:    "system",
      leadId:   undefined,
      template: "support",
    });
  } catch (err) {
    console.error("[support/contact] email failed:", err);
    return NextResponse.json({ error: "Failed to send message. Please email us directly." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
