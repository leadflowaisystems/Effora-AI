/**
 * POST /api/webhooks/razorpay/[orgId]
 *
 * Handles Razorpay webhook events:
 *   payment_link.paid      → capture payment, lead stage = won, LTV += amount, emit payment.captured
 *   payment.captured       → same (for order-based payments)
 *   payment_link.cancelled → mark payment failed (never downgrades a captured payment)
 *
 * Signature verified via X-Razorpay-Signature (HMAC-SHA256 of raw body).
 *
 * Configure in Razorpay dashboard:
 *   Webhook URL: https://<domain>/api/webhooks/razorpay/<orgId>
 *   Active events: payment_link.paid, payment_link.cancelled
 *
 * ── IDEMPOTENCY ──────────────────────────────────────────────────────────
 * Razorpay delivers at-least-once and retries with exponential backoff, so
 * the same event WILL arrive more than once, sometimes concurrently.
 *
 * The capture is therefore a single atomic compare-and-swap:
 *
 *   UPDATE payments SET status='paid', …
 *    WHERE org_id=$1 AND payment_link_id=$2 AND status IN ('pending','failed')
 *    RETURNING …
 *
 * Under READ COMMITTED a concurrent duplicate blocks on the row lock, then
 * re-evaluates the predicate against the committed row (EvalPlanQual), sees
 * status='paid' and updates ZERO rows. Exactly one delivery therefore gets a
 * non-empty RETURNING and runs the business side effects — no "check then
 * write" race window exists, because there is no separate check.
 *
 * This also covers: the same event id twice, two DIFFERENT event ids for the
 * same payment, and a payment already captured manually via mark-paid.
 *
 * x-razorpay-event-id is recorded for auditability only (webhook_events.payload
 * and lead_events.metadata, both existing JSONB columns) — it is deliberately
 * NOT the idempotency key, so no schema change is required.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyWebhookSignature, getRazorpayWebhookSecret } from "@/lib/razorpay";
import { writeLeadEvent } from "@/lib/lead-events";
import { inngest } from "@/lib/inngest/client";

// Capture does ~5 sequential DB round-trips (~240ms each from iad1). The AI
// receipt + WhatsApp send deliberately do NOT run here — they are handled by
// the durable on-payment-captured Inngest function — so this stays well inside
// Razorpay's delivery timeout.
export const maxDuration = 15;

interface Params { params: { orgId: string } }

/** Statuses a webhook is allowed to transition INTO 'paid'. */
const CAPTURABLE_STATUSES = ["pending", "failed"];

/**
 * Append-only audit trail for handled Razorpay deliveries, written to the
 * existing webhook_events table (no schema change). Records the Razorpay event
 * id and whether this particular delivery performed the capture, so a duplicate
 * retry is visible in history rather than invisible.
 *
 * Never throws — but failures are logged, never silently swallowed.
 * Contains no secrets: event ids and payment/link ids are not credentials.
 */
async function auditWebhook(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;
    const { error } = await svc.from("webhook_events").insert({
      org_id:     orgId,
      provider:   "razorpay",
      event_type: eventType,
      payload,
      verified:   true,   // only reached after signature verification passes
    });
    if (error) console.error(`[razorpay-webhook] audit insert failed: ${error.message}`);
  } catch (e) {
    console.error("[razorpay-webhook] audit insert threw:", e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const rawBody  = await req.text();
  const sigHeader = req.headers.get("x-razorpay-signature") ?? "";

  // ── Fail-closed signature verification ───────────────────────
  // Runs before any DB mutation. The previous `if (secret && sigHeader)`
  // guard meant an unsigned request skipped verification entirely, so any
  // caller who knew the orgId could forge a capture.
  const webhookSecret = await getRazorpayWebhookSecret(params.orgId);

  if (!webhookSecret) {
    // Server-side configuration gap, not a bad request: 503 so Razorpay
    // retries once a webhook secret is saved in Settings › Payments,
    // rather than the delivery being silently discarded.
    console.error(
      `[razorpay-webhook] no webhook secret configured for org ${params.orgId} — rejecting. ` +
      `Save the Razorpay webhook secret in Settings › Payments.`,
    );
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  if (!sigHeader) {
    console.warn(`[razorpay-webhook] missing x-razorpay-signature for org ${params.orgId} — rejecting`);
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  if (!verifyWebhookSignature(rawBody, sigHeader, webhookSecret)) {
    console.warn(`[razorpay-webhook] signature mismatch for org ${params.orgId} — rejecting`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.event as string | undefined;
  // Razorpay's per-delivery identifier. Retries of the SAME event reuse it;
  // it is absent only for hand-crafted requests, which is tolerated because
  // idempotency does not depend on it (see file header).
  const eventId = req.headers.get("x-razorpay-event-id");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc   = createServiceClient() as any;
  const orgId = params.orgId;

  // ── payment_link.paid ────────────────────────────────────────
  if (event === "payment_link.paid" || event === "payment.captured") {
    const payloadData = payload.payload as Record<string, unknown> | undefined;
    const plEntity = (payloadData?.payment_link as Record<string, unknown> | undefined)?.entity as Record<string, unknown> | undefined;
    const payEntity = (payloadData?.payment    as Record<string, unknown> | undefined)?.entity as Record<string, unknown> | undefined;

    const paymentLinkId = (plEntity?.id ?? payEntity?.order_id) as string | undefined;
    const razorpayPaymentId = payEntity?.id as string | undefined;

    if (!paymentLinkId && !razorpayPaymentId) {
      console.warn(`[razorpay-webhook] ${event} carries no payment identifier — ignoring event_id=${eventId ?? "none"}`);
      return NextResponse.json({ ok: true }); // can't identify payment
    }

    const now = new Date().toISOString();

    // ── ATOMIC CAPTURE (compare-and-swap) ──────────────────────
    // One statement: match + guard + mutate + return. Duplicate and concurrent
    // deliveries update zero rows and fall through to the no-op branch below.
    let capture = svc
      .from("payments")
      .update({
        status:              "paid",
        razorpay_payment_id: razorpayPaymentId ?? null,
        captured_at:         now,
        payment_method:      "razorpay",
        updated_at:          now,
      })
      .eq("org_id", orgId);

    capture = paymentLinkId
      ? capture.eq("payment_link_id", paymentLinkId)
      : capture.eq("razorpay_payment_id", razorpayPaymentId);

    const { data: capturedRows, error: captureErr } = await capture
      .in("status", CAPTURABLE_STATUSES)   // never re-capture 'paid' or resurrect 'refunded'
      .select("id, lead_id, amount_inr, conversation_id, notes");

    if (captureErr) {
      // Never silently swallow a payment-processing failure: surface a 5xx so
      // Razorpay retries. The CAS makes that retry safe.
      console.error(`[razorpay-webhook] capture update failed org=${orgId} event_id=${eventId ?? "none"}: ${captureErr.message}`);
      return NextResponse.json({ error: "Capture failed" }, { status: 500 });
    }

    const captured = (capturedRows ?? [])[0] as
      | { id: string; lead_id: string; amount_inr: number; conversation_id: string | null; notes: string | null }
      | undefined;

    // ── Lost the race, already captured, or unknown link ───────
    if (!captured) {
      const { data: existing } = await svc
        .from("payments")
        .select("id, status")
        .eq("org_id", orgId)
        .eq(paymentLinkId ? "payment_link_id" : "razorpay_payment_id", paymentLinkId ?? razorpayPaymentId)
        .maybeSingle();

      const reason = existing ? `already_${(existing as { status: string }).status}` : "payment_not_found";
      console.log(`[razorpay-webhook] no-op ${reason} org=${orgId} event=${event} event_id=${eventId ?? "none"}`);
      await auditWebhook(orgId, event, {
        razorpay_event_id: eventId,
        payment_link_id:   paymentLinkId ?? null,
        razorpay_payment_id: razorpayPaymentId ?? null,
        processed: false,
        reason,
      });
      // 200: the desired state already holds, so a further retry would not help.
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // ── Winner: exactly one delivery reaches here per payment ──
    const { data: leadRow } = await svc
      .from("leads")
      .select("ltv_inr")
      .eq("id", captured.lead_id)
      .eq("org_id", orgId)
      .maybeSingle();

    const currentLtv = Number((leadRow as { ltv_inr: number | null } | null)?.ltv_inr ?? 0);
    const amountInr  = Number(captured.amount_inr ?? 0);

    // Advance lead to "won" and add this payment's value exactly once.
    // Amount comes from OUR payment row, not the webhook payload, so the
    // recorded LTV always matches what we actually charged.
    const { error: leadErr } = await svc
      .from("leads")
      .update({ stage: "won", ltv_inr: currentLtv + amountInr, updated_at: now })
      .eq("id", captured.lead_id)
      .eq("org_id", orgId);

    if (leadErr) console.error(`[razorpay-webhook] lead update failed payment=${captured.id}: ${leadErr.message}`);

    // Awaited, not fire-and-forget: on serverless the function may freeze the
    // moment the response is returned, which would drop a floating promise.
    await writeLeadEvent({
      orgId,
      leadId:     captured.lead_id,
      eventType:  "payment_paid",
      entityType: "payment",
      entityId:   captured.id,
      title:      `Payment received — ₹${amountInr.toLocaleString("en-IN")}`,
      metadata:   {
        amount_inr:          amountInr,
        source:              "razorpay_webhook",
        razorpay_event_id:   eventId,
        razorpay_payment_id: razorpayPaymentId ?? null,
      },
    });

    await auditWebhook(orgId, event, {
      razorpay_event_id:   eventId,
      payment_link_id:     paymentLinkId ?? null,
      razorpay_payment_id: razorpayPaymentId ?? null,
      payment_id:          captured.id,
      amount_inr:          amountInr,
      processed: true,
      reason: "captured",
    });

    // Receipt (AI + WhatsApp + email) runs in the durable on-payment-captured
    // function, off this request's critical path. The event id keeps Inngest
    // from starting a second run if this event is somehow emitted twice.
    try {
      await inngest.send({
        id:   `payment-captured-${captured.id}`,
        name: "payment.captured",
        data: {
          orgId,
          paymentId:      captured.id,
          leadId:         captured.lead_id,
          conversationId: captured.conversation_id,
          amountInr,
          description:    captured.notes ?? "the program",
        },
      });
    } catch (e) {
      // Payment state is already correct and durable. Returning 5xx would only
      // trigger a retry that the CAS no-ops, so it cannot recover the receipt —
      // log loudly instead of pretending nothing happened.
      console.error(
        `[razorpay-webhook] RECEIPT NOT SCHEDULED — inngest.send failed for payment=${captured.id} ` +
        `org=${orgId}. Payment IS captured; the receipt must be sent manually.`, e,
      );
    }

    console.log(`[razorpay-webhook] captured payment=${captured.id} org=${orgId} event_id=${eventId ?? "none"}`);
    return NextResponse.json({ ok: true, captured: true });
  }

  // ── payment_link.cancelled ───────────────────────────────────
  if (event === "payment_link.cancelled") {
    const plId = ((payload.payload as Record<string, unknown>)
      ?.payment_link as Record<string, unknown> | undefined)
      ?.entity as Record<string, unknown> | undefined;
    const id = plId?.id as string | undefined;
    if (id) {
      // .neq("status","paid") — a late or out-of-order cancellation must never
      // downgrade a payment that has already been captured.
      const { data: cancelled, error: cancelErr } = await svc.from("payments").update({
        status:     "failed",
        updated_at: new Date().toISOString(),
      })
        .eq("org_id", orgId)
        .eq("payment_link_id", id)
        .neq("status", "paid")
        .select("id");

      if (cancelErr) {
        console.error(`[razorpay-webhook] cancel update failed org=${orgId} link=${id}: ${cancelErr.message}`);
        return NextResponse.json({ error: "Cancel failed" }, { status: 500 });
      }

      const n = (cancelled ?? []).length;
      console.log(`[razorpay-webhook] cancelled rows=${n} org=${orgId} event_id=${eventId ?? "none"}`);
      await auditWebhook(orgId, event, {
        razorpay_event_id: eventId,
        payment_link_id:   id,
        processed:         n > 0,
        reason:            n > 0 ? "cancelled" : "not_cancellable_or_already_paid",
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Unrecognised event — acknowledged so Razorpay stops retrying, with zero
  // database access of any kind.
  return NextResponse.json({ ok: true, event });
}
