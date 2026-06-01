/**
 * POST /api/orgs/[orgId]/payments/manual
 * Records a payment that happened outside the automated flow.
 * Sends an AI receipt confirmation to the lead's inbox + email if available.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAccessState } from "@/lib/access";
import { generatePaymentReceivedMessage } from "@/lib/ai";
import { getOrCreateConversation, insertOutboundMessage } from "@/lib/conversation";
import { sendEmail } from "@/lib/email";
import { paymentReceived } from "@/lib/email-templates";
import { getLeadFirstName } from "@/lib/leads";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";

export const maxDuration = 30;

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
  lead_id:        z.string().uuid(),
  amount_inr:     z.number().positive(),
  payment_method: z.enum(["upi", "bank_transfer", "cash", "other"]),
  received_at:    z.string().datetime(),
  description:    z.string().max(500).optional(),
});

async function handler(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAccessState(params.orgId);
  if (!access.canUseManualBookingPayment) {
    return NextResponse.json({ error: "Manual payment recording requires Starter plan or above." }, { status: 403 });
  }

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { lead_id, amount_inr, payment_method, received_at, description } = parsed.data;
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // ── Load lead + voice profile + org ──────────────────────────
  const [leadRes, vpRes, orgRes] = await Promise.all([
    svc.from("leads").select("id, name, external_id, metadata, ltv_inr").eq("id", lead_id).eq("org_id", params.orgId).single(),
    svc.from("voice_profiles").select("tone, offer, price_range, sells, objections, extra_context").eq("org_id", params.orgId).single(),
    svc.from("orgs").select("name").eq("id", params.orgId).single(),
  ]);

  if (!leadRes.data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const lead      = leadRes.data as { id: string; name: string | null; external_id: string | null; metadata?: Record<string, unknown>; ltv_inr: number | null };
  const vp        = vpRes.data as Parameters<typeof generatePaymentReceivedMessage>[0]["voiceProfile"];
  const orgName   = (orgRes.data as { name: string } | null)?.name ?? "Your Coach";
  const leadEmail = (lead.metadata?.email) as string | undefined ?? null;
  const firstName = getLeadFirstName({ name: lead.name, external_id: lead.external_id });
  const desc      = description || payment_method;

  // ── Insert payment row ────────────────────────────────────────
  const { data: payment, error } = await svc.from("payments").insert({
    org_id:         params.orgId,
    lead_id,
    amount_inr,
    status:         "paid",
    payment_method,
    notes:          description ? `${payment_method}: ${description}` : payment_method,
    source:         "manual",
    captured_at:    received_at,
    created_at:     now,
    updated_at:     now,
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const p = payment as { id: string };

  // ── Update lead stage + LTV ───────────────────────────────────
  await svc.from("leads").update({
    stage:      "won",
    ltv_inr:    (lead.ltv_inr ?? 0) + amount_inr,
    updated_at: now,
  }).eq("id", lead_id);

  // ── Get or create conversation, send AI message ───────────────
  const conversationId = await getOrCreateConversation(params.orgId, lead_id, "manual");

  const aiResult = await generatePaymentReceivedMessage({
    leadFirstName: firstName,
    amountInr:     amount_inr,
    description:   desc,
    voiceProfile:  vp,
    orgId:         params.orgId,
  }).catch(() => ({
    content: `Payment received ${firstName ? `, ${firstName}` : ""}. ₹${amount_inr.toLocaleString("en-IN")} for ${desc} confirmed. Welcome — I'll be in touch with next steps.`,
  }));

  await insertOutboundMessage(conversationId, params.orgId, aiResult.content, "payment_received");

  // ── Send email ────────────────────────────────────────────────
  if (leadEmail) {
    await sendEmail({
      to:       leadEmail,
      subject:  "Payment received — welcome!",
      html:     paymentReceived({
        leadName:    firstName || "there",
        amount:      `₹${amount_inr.toLocaleString("en-IN")}`,
        description: desc,
        coachName:   orgName,
      }),
      orgId:    params.orgId,
      leadId:   lead_id,
      template: "paymentReceived",
    }).catch(() => null);
  }

  return NextResponse.json({ payment_id: p.id, conversation_id: conversationId });
}

export const POST = withErrorHandler("payments/manual", handler);
