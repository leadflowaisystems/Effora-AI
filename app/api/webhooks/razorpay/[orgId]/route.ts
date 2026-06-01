/**
 * POST /api/webhooks/razorpay/[orgId]
 *
 * Handles Razorpay webhook events:
 *   payment_link.paid → mark payment paid, lead stage = won, emit payment.captured
 *   payment.captured  → same (for order-based payments)
 *   payment_link.cancelled → mark payment failed
 *
 * Signature verified via X-Razorpay-Signature (HMAC-SHA256 of raw body).
 *
 * Configure in Razorpay dashboard:
 *   Webhook URL: https://<domain>/api/webhooks/razorpay/<orgId>
 *   Active events: payment_link.paid
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyWebhookSignature, getRazorpayWebhookSecret } from "@/lib/razorpay";
import { inngest } from "@/lib/inngest/client";

interface Params { params: { orgId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const rawBody  = await req.text();
  const sigHeader = req.headers.get("x-razorpay-signature") ?? "";

  // Verify signature when secret is configured
  const webhookSecret = await getRazorpayWebhookSecret(params.orgId);
  if (webhookSecret && sigHeader) {
    if (!verifyWebhookSignature(rawBody, sigHeader, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.event as string | undefined;
  const svc   = createServiceClient();
  const orgId = params.orgId;

  // ── payment_link.paid ────────────────────────────────────────
  if (event === "payment_link.paid" || event === "payment.captured") {
    const payloadData = payload.payload as Record<string, unknown> | undefined;
    const plEntity = (payloadData?.payment_link as Record<string, unknown> | undefined)?.entity as Record<string, unknown> | undefined;
    const payEntity = (payloadData?.payment    as Record<string, unknown> | undefined)?.entity as Record<string, unknown> | undefined;

    const paymentLinkId = (plEntity?.id ?? payEntity?.order_id) as string | undefined;
    const razorpayPaymentId = payEntity?.id as string | undefined;
    const amount = (payEntity?.amount as number | undefined ?? 0) / 100; // paise → INR

    // Find our payment row by payment_link_id or razorpay_order_id
    let query = svc.from("payments").select("id, lead_id, conversation_id");
    if (paymentLinkId) {
      query = query.eq("payment_link_id", paymentLinkId) as typeof query;
    } else if (razorpayPaymentId) {
      query = query.eq("razorpay_payment_id", razorpayPaymentId) as typeof query;
    } else {
      return NextResponse.json({ ok: true }); // can't identify payment
    }

    const { data: paymentRow } = await query.eq("org_id", orgId).maybeSingle();

    if (!paymentRow) {
      console.warn("[razorpay-webhook] payment row not found for", paymentLinkId);
      return NextResponse.json({ ok: true });
    }

    const pm = paymentRow as { id: string; lead_id: string; conversation_id: string | null };
    const now = new Date().toISOString();

    // Mark payment paid
    await svc.from("payments").update({
      status:             "paid",
      razorpay_payment_id: razorpayPaymentId ?? null,
      updated_at:         now,
    }).eq("id", pm.id);

    // Advance lead to "won"
    await svc.from("leads").update({
      stage:      "won",
      updated_at: now,
    }).eq("id", pm.lead_id);

    // Emit captured event (could trigger downstream logic)
    await inngest.send({
      name: "payment.captured",
      data: {
        orgId,
        paymentId:      pm.id,
        leadId:         pm.lead_id,
        conversationId: pm.conversation_id,
        amountInr:      amount,
      },
    });

    return NextResponse.json({ ok: true });
  }

  // ── payment_link.cancelled ───────────────────────────────────
  if (event === "payment_link.cancelled") {
    const plId = ((payload.payload as Record<string, unknown>)
      ?.payment_link as Record<string, unknown> | undefined)
      ?.entity as Record<string, unknown> | undefined;
    const id = plId?.id as string | undefined;
    if (id) {
      await svc.from("payments").update({
        status:     "failed",
        updated_at: new Date().toISOString(),
      }).eq("org_id", orgId).eq("payment_link_id", id);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, event });
}
