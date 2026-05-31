/**
 * POST /api/orgs/[orgId]/payments/link-generate
 * Creates a payment link (Razorpay or UPI deep-link) for a lead.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createPaymentLink } from "@/lib/razorpay";
import { inngest } from "@/lib/inngest/client";
import { getOrCreateConversation, insertOutboundMessage } from "@/lib/conversation";
import { generatePaymentLinkMessage } from "@/lib/ai";
import { sendEmail } from "@/lib/email";
import { paymentLink as paymentLinkEmail } from "@/lib/email-templates";
import { getLeadFirstName } from "@/lib/leads";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const Schema = z.object({
  lead_id:     z.string().uuid(),
  amount_inr:  z.number().positive(),
  description: z.string().min(1).max(500),
  method:      z.enum(["razorpay", "upi", "auto"]).default("auto"),
});

async function handler(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { lead_id, amount_inr, description, method } = parsed.data;
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Load org + integrations + voice profile in parallel
  const [orgRes, rzpRes, leadRes, vpRes] = await Promise.all([
    svc.from("orgs").select("name, upi_id").eq("id", params.orgId).single(),
    svc.from("integrations").select("config, active").eq("org_id", params.orgId).eq("provider", "razorpay").eq("active", true).maybeSingle(),
    svc.from("leads").select("id, name, external_id, metadata").eq("id", lead_id).eq("org_id", params.orgId).single(),
    svc.from("voice_profiles").select("tone, offer, price_range, sells, objections, extra_context").eq("org_id", params.orgId).maybeSingle(),
  ]);

  if (!leadRes.data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const org   = orgRes.data as { name: string; upi_id: string | null } | null;
  const rzp   = rzpRes.data as { config: Record<string, string>; active: boolean } | null;
  const lead  = leadRes.data as { id: string; name: string | null; external_id?: string | null; metadata?: Record<string, unknown> };
  const vp    = vpRes.data as { tone: string; offer: string; price_range: string; sells: string; objections: string[]; extra_context: string } | null;
  const leadEmail = (lead.metadata?.email) as string | undefined ?? null;
  const firstName = getLeadFirstName({ name: lead.name, external_id: lead.external_id ?? null });

  const hasRazorpay = !!rzp?.active;
  const hasUpi      = !!org?.upi_id;

  let linkUrl    = "";
  let linkMethod = "upi";

  const useRazorpay = method === "razorpay" || (method === "auto" && hasRazorpay);
  const useUpi      = method === "upi"      || (method === "auto" && !hasRazorpay && hasUpi);

  if (useRazorpay && hasRazorpay) {
    try {
      const result = await createPaymentLink({
        orgId:        params.orgId,
        amountInr:    amount_inr,
        description,
        customerName: lead.name ?? undefined,
      });
      linkUrl    = result?.shortUrl ?? "";
      linkMethod = "razorpay";
    } catch {
      // fall through to UPI
    }
  }

  if (!linkUrl && useUpi && hasUpi) {
    const pa  = encodeURIComponent(org!.upi_id!);
    const pn  = encodeURIComponent(org?.name ?? "Coach");
    const am  = encodeURIComponent(String(amount_inr));
    const tn  = encodeURIComponent(description);
    linkUrl    = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&tn=${tn}&cu=INR`;
    linkMethod = "upi";
  }

  if (!linkUrl) {
    return NextResponse.json({ error: "No payment method configured. Connect Razorpay or add a UPI ID in Settings › Payments." }, { status: 400 });
  }

  // ── Get or create conversation so Inngest handler can thread the message ──
  const conversationId = await getOrCreateConversation(params.orgId, lead_id, "manual");

  // Insert payment row WITH conversation_id so on-payment-link-message can find it
  const { data: payment, error } = await svc.from("payments").insert({
    org_id:           params.orgId,
    lead_id,
    amount_inr,
    status:           "pending",
    payment_link_url: linkUrl,
    link_url:         linkUrl,
    link_method:      linkMethod,
    notes:            `${linkMethod}: ${description}`,
    source:           linkMethod,
    conversation_id:  conversationId,
    created_at:       now,
    updated_at:       now,
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const p = payment as { id: string };

  // ── Insert payment link message into thread synchronously ────────
  // This guarantees the message appears immediately in the conversation,
  // independent of Inngest availability. Inngest fires as an async retry.
  try {
    const aiResult = await generatePaymentLinkMessage({
      leadFirstName: firstName,
      amountInr:     amount_inr,
      description,
      paymentUrl:    linkUrl,
      voiceProfile:  vp,
      orgId:         params.orgId,
    });
    await insertOutboundMessage(conversationId, params.orgId, aiResult.content, "payment_link");
  } catch (e) {
    // If synchronous generation fails, Inngest will retry below
    console.error("[link-generate] sync message insert failed, falling back to Inngest:", e);
    // Fire Inngest as fallback
    await inngest.send({
      name: "payment.link-message",
      data: { orgId: params.orgId, paymentId: p.id, description },
    }).catch(() => null);
  }

  // Send email if lead has email (in addition to in-thread message)
  if (leadEmail) {
    await sendEmail({
      to:       leadEmail,
      subject:  "Your payment link",
      html:     paymentLinkEmail({
        leadName:    firstName || "there",
        amount:      `₹${amount_inr.toLocaleString("en-IN")}`,
        description,
        paymentUrl:  linkUrl,
        coachName:   org?.name ?? "Your Coach",
      }),
      orgId:    params.orgId,
      leadId:   lead_id,
      template: "paymentLink",
    }).catch(() => null);
  }

  return NextResponse.json({ payment_id: p.id, link_url: linkUrl, method: linkMethod, conversation_id: conversationId });
}

export const POST = withErrorHandler("payments/link-generate", handler);
