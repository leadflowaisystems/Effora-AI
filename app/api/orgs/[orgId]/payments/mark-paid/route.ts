/**
 * POST /api/orgs/[orgId]/payments/mark-paid
 * Converts an existing pending payment to captured, or creates a new captured payment.
 * Sends receipt message + email.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generatePaymentReceivedMessage } from "@/lib/ai";
import { getOrCreateConversation, deliverOutboundMessage } from "@/lib/conversation";
import { templateCustomerName, templateAmountInr, templateDescription } from "@/lib/whatsapp-templates";
import { sendEmail } from "@/lib/email";
import { paymentReceived } from "@/lib/email-templates";
import { getLeadFirstName } from "@/lib/leads";
import { z } from "zod";
import { writeLeadEvent } from "@/lib/lead-events";

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
  payment_id:     z.string().uuid().optional(),          // existing pending payment to flip
  lead_id:        z.string().uuid().optional(),          // required when creating new captured payment
  amount_inr:     z.number().positive().optional(),
  payment_method: z.enum(["upi","bank_transfer","cash","razorpay","other"]).optional(),
  received_at:    z.string().datetime().optional(),
  description:    z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { payment_id, lead_id, amount_inr, payment_method, received_at, description } = parsed.data;
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  let resolvedLeadId: string;
  let resolvedAmount: number;
  let resolvedDesc: string;
  let resolvedPaymentId: string;

  if (payment_id) {
    // Flip existing pending payment
    const { data: existing, error: fetchErr } = await svc
      .from("payments").select("id, lead_id, amount_inr, notes")
      .eq("id", payment_id).eq("org_id", params.orgId).single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    const p = existing as { id: string; lead_id: string; amount_inr: number; notes: string | null };

    await svc.from("payments").update({
      status: "paid", captured_at: received_at ?? now,
      payment_method: payment_method ?? "other", updated_at: now,
    }).eq("id", payment_id);

    resolvedLeadId    = p.lead_id;
    resolvedAmount    = p.amount_inr;
    resolvedDesc      = templateDescription(description ?? p.notes);
    resolvedPaymentId = p.id;
    void writeLeadEvent({
      orgId: params.orgId, leadId: p.lead_id,
      eventType: "payment_paid", entityType: "payment", entityId: p.id,
      title: `Payment marked as received — ₹${p.amount_inr.toLocaleString("en-IN")}`,
      metadata: { amount_inr: p.amount_inr },
    });
  } else {
    // Create a new captured payment row
    if (!lead_id || !amount_inr) {
      return NextResponse.json({ error: "lead_id and amount_inr are required" }, { status: 400 });
    }

    // SECURITY: lead_id comes from the request body and must be proven to belong
    // to this org BEFORE anything is written.
    //
    // assertMember() proves the caller belongs to params.orgId, but said nothing
    // about who owns lead_id. The lead was only loaded further down — org-scoped
    // but with no null guard — so a foreign lead simply yielded `lead = null`
    // and execution continued into an UNSCOPED `leads` update. A member of org A
    // could therefore pass org B's lead id and overwrite that lead's stage and
    // ltv_inr. Reproduced against production: HTTP 200, victim lead went
    // warm -> won and ltv_inr 50000 -> 999, destroying the real value.
    //
    // 404 rather than 403 so the response cannot be used to enumerate lead ids
    // in other orgs. This runs before the payments insert, so a rejected request
    // mutates nothing at all.
    const { data: ownedLead } = await svc
      .from("leads")
      .select("id")
      .eq("id", lead_id)
      .eq("org_id", params.orgId)
      .single();

    if (!ownedLead) {
      console.warn(`[mark-paid] lead not found in org — rejected org=${params.orgId} lead=${lead_id}`);
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { data: pNew, error: pErr } = await svc.from("payments").insert({
      org_id: params.orgId, lead_id, amount_inr,
      status: "paid", payment_method: payment_method ?? "other",
      source: "manual_marked", captured_at: received_at ?? now,
      notes: description ?? null, created_at: now, updated_at: now,
    }).select("id").single();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    const newId = (pNew as { id: string }).id;
    resolvedLeadId    = lead_id;
    resolvedAmount    = amount_inr;
    resolvedDesc      = templateDescription(description);
    resolvedPaymentId = newId;
    void writeLeadEvent({
      orgId: params.orgId, leadId: lead_id,
      eventType: "payment_created", entityType: "payment", entityId: newId,
      title: `Payment recorded — ₹${amount_inr.toLocaleString("en-IN")}`,
      metadata: { amount_inr },
    });
    void writeLeadEvent({
      orgId: params.orgId, leadId: lead_id,
      eventType: "payment_paid", entityType: "payment", entityId: newId,
      title: `Payment marked as received — ₹${amount_inr.toLocaleString("en-IN")}`,
      metadata: { amount_inr },
    });
  }

  // Load lead + voice profile + org
  const [leadRes, vpRes, orgRes] = await Promise.all([
    svc.from("leads").select("name, external_id, metadata, ltv_inr").eq("id", resolvedLeadId).eq("org_id", params.orgId).single(),
    svc.from("voice_profiles").select("tone, offer, price_range, sells, objections, extra_context").eq("org_id", params.orgId).single(),
    svc.from("orgs").select("name").eq("id", params.orgId).single(),
  ]);

  const lead      = leadRes.data as { name: string | null; external_id: string | null; metadata?: Record<string, unknown>; ltv_inr: number | null } | null;
  const vp        = vpRes.data as Parameters<typeof generatePaymentReceivedMessage>[0]["voiceProfile"];
  const orgName   = (orgRes.data as { name: string } | null)?.name ?? "Your Coach";
  const leadEmail = (lead?.metadata?.email) as string | undefined ?? null;
  const firstName = getLeadFirstName({ name: lead?.name ?? null, external_id: lead?.external_id ?? null });

  // Update lead stage + LTV. Org-scoped as defence in depth: both paths now
  // prove ownership first (the payment_id branch resolves the lead from an
  // org-scoped payment row, the create branch checks lead_id above), so this
  // filter should never change the outcome — it just makes a cross-tenant write
  // impossible even if a future caller reaches here unchecked.
  await svc.from("leads").update({
    stage: "won", ltv_inr: (lead?.ltv_inr ?? 0) + resolvedAmount, updated_at: now,
  }).eq("id", resolvedLeadId).eq("org_id", params.orgId);

  // Send receipt message to thread
  const convId = await getOrCreateConversation(params.orgId, resolvedLeadId, "manual");
  const aiMsg  = await generatePaymentReceivedMessage({
    leadFirstName: firstName, amountInr: resolvedAmount,
    description: resolvedDesc, voiceProfile: vp, orgId: params.orgId,
  }).catch(() => ({
    content: `Payment received${firstName ? `, ${firstName}` : ""}. ₹${resolvedAmount.toLocaleString("en-IN")} confirmed for ${resolvedDesc}. Welcome — I'll send the next steps shortly.`,
  }));
  // Use deliverOutboundMessage so Instagram leads receive the receipt DM.
  // effora_payment_received params, used only outside the 24-hour window:
  // {{1}} customer name, {{2}} formatted amount, {{3}} description — the same
  // values the prose and the email are built from.
  const { delivered: receiptDelivered } = await deliverOutboundMessage(
    convId, params.orgId, aiMsg.content, "payment_received",
    [templateCustomerName(firstName), templateAmountInr(resolvedAmount), resolvedDesc],
  );
  console.log(`[payments/mark-paid] receipt message delivered=${receiptDelivered} conv=${convId}`);

  // Email
  if (leadEmail) {
    await sendEmail({
      to: leadEmail, subject: "Payment received — welcome!",
      html: paymentReceived({ leadName: firstName || "there", amount: `₹${resolvedAmount.toLocaleString("en-IN")}`, description: resolvedDesc, coachName: orgName }),
      orgId: params.orgId, leadId: resolvedLeadId, template: "paymentReceived",
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true, payment_id: resolvedPaymentId, conversation_id: convId });
}
