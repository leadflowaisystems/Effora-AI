/**
 * POST /api/orgs/[orgId]/payments/simulate
 * Dev-only (403 in production).
 *
 * Simulates the Razorpay payment lifecycle without a real webhook or public tunnel.
 *
 * action = "create"   — creates a pending payment row, emits payment.created
 * action = "capture"  — marks an existing payment as paid, lead stage = won
 * action = "unpaid"   — directly emits payment.unpaid to trigger dunning immediately
 *
 * All error responses include { error, step } so the frontend can display exactly
 * where in the flow the failure occurred.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { generatePaymentLinkMessage } from "@/lib/ai";
import { getLeadFirstName } from "@/lib/leads";

interface Params { params: { orgId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 }); // hide existence in prod
  }

  let currentStep = "init";

  try {
    // ── Auth ──────────────────────────────────────────────────
    currentStep = "auth";
    console.log("[simulate/payment] step: auth");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Parse body ────────────────────────────────────────────
    currentStep = "parse_body";
    const body = await req.json().catch(() => ({}));
    const { action, leadId, amountInr, description, paymentId } = body as {
      action:        "create" | "capture" | "unpaid";
      leadId?:       string;
      amountInr?:    number;
      description?:  string;
      paymentId?:    string;
    };
    console.log(`[simulate/payment] step: parse_body  action=${action}`);

    const orgId = params.orgId;
    const svc   = createServiceClient();
    const now   = new Date().toISOString();

    // ════════════════════════════════════════════════════════════
    // ── CREATE ───────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════
    if (action === "create") {
      if (!leadId)
        return NextResponse.json({ error: "leadId required", step: "validate" }, { status: 400 });
      if (!amountInr || amountInr <= 0)
        return NextResponse.json({ error: "amountInr required and must be > 0", step: "validate" }, { status: 400 });

      // Find most recent conversation for lead
      currentStep = "fetch_conversation";
      console.log(`[simulate/payment] step: fetch_conversation  leadId=${leadId}`);
      const { data: convRow, error: convErr } = await svc
        .from("conversations")
        .select("id")
        .eq("org_id", orgId)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (convErr) {
        console.warn("[simulate/payment] fetch_conversation warning:", convErr.message);
      }
      const conversationId = (convRow as { id: string } | null)?.id ?? null;
      console.log(`[simulate/payment] conversationId=${conversationId ?? "none"}`);

      const fakeUrl = `https://rzp.io/l/sim_${Date.now()}`;

      // Insert pending payment
      currentStep = "insert_payment";
      console.log(`[simulate/payment] step: insert_payment  amount=${amountInr}`);
      const { data: payment, error: pmErr } = await svc.from("payments").insert({
        org_id:           orgId,
        lead_id:          leadId,
        conversation_id:  conversationId,
        amount_inr:       amountInr,
        status:           "pending",
        payment_link_id:  `sim_plink_${Date.now()}`,
        payment_link_url: fakeUrl,
        updated_at:       now,
      }).select("id").single();

      if (pmErr || !payment) {
        console.error("[simulate/payment] insert_payment failed:", pmErr?.message);
        return NextResponse.json(
          { error: pmErr?.message ?? "Failed to insert payment", step: "insert_payment" },
          { status: 500 }
        );
      }
      const pid = (payment as { id: string }).id;
      console.log(`[simulate/payment] payment created: ${pid}`);

      // ── Send payment link message synchronously ────────────────
      // (Dev simulate: bypass Inngest so the message appears immediately)
      if (conversationId) {
        currentStep = "link_message";
        console.log("[simulate/payment] step: link_message  conv=", conversationId);
        try {
          const [leadRes, voiceRes] = await Promise.all([
            svc.from("leads").select("name, external_id").eq("id", leadId).maybeSingle(),
            svc.from("voice_profiles").select("tone, offer").eq("org_id", orgId).maybeSingle(),
          ]);
          const lead  = leadRes.data  as { name: string | null; external_id: string | null } | null;
          const voice = voiceRes.data as { tone: string; offer: string } | null;

          const result = await generatePaymentLinkMessage({
            leadFirstName: getLeadFirstName({ name: lead?.name, external_id: lead?.external_id }),
            amountInr:     amountInr!,
            description:   description || voice?.offer || "the program",
            paymentUrl:    fakeUrl,
            voiceProfile:  voice ? { tone: voice.tone, offer: voice.offer, price_range: "", sells: "", objections: [], extra_context: "" } : null,
            orgId,
          });

          const now2 = new Date().toISOString();
          await svc.from("messages").insert({
            conversation_id: conversationId,
            org_id:          orgId,
            direction:       "outbound",
            content:         result.content,
            sent_at:         now2,
            metadata:        { source: "payment_link" },
          });
          await svc.from("conversations").update({
            last_message_at:      now2,
            last_message_preview: result.content.slice(0, 80),
          }).eq("id", conversationId);

          console.log(`[simulate/payment] ✓ payment link message inserted: "${result.content.slice(0, 60)}…"`);
        } catch (msgErr) {
          console.error("[simulate/payment] link_message error (non-fatal):", msgErr);
        }
      }

      currentStep = "inngest_send";
      console.log("[simulate/payment] step: inngest_send  event=payment.created");
      await inngest.send({
        name: "payment.created",
        data: { orgId, paymentId: pid, leadId, conversationId },
      });
      console.log("[simulate/payment] ✓ payment.created emitted");

      return NextResponse.json({ ok: true, paymentId: pid, conversationId });
    }

    // ════════════════════════════════════════════════════════════
    // ── CAPTURE (mark paid) ──────────────────────────────────────
    // ════════════════════════════════════════════════════════════
    if (action === "capture") {
      if (!paymentId)
        return NextResponse.json({ error: "paymentId required", step: "validate" }, { status: 400 });

      currentStep = "fetch_payment";
      console.log(`[simulate/payment] step: fetch_payment  id=${paymentId}`);
      const { data: pm, error: pmErr } = await svc
        .from("payments")
        .select("id, lead_id, conversation_id, amount_inr")
        .eq("id", paymentId)
        .eq("org_id", orgId)
        .single();

      if (pmErr) {
        console.error("[simulate/payment] fetch_payment error:", pmErr.message);
        return NextResponse.json({ error: pmErr.message, step: "fetch_payment" }, { status: 500 });
      }
      if (!pm) {
        return NextResponse.json({ error: "Payment not found", step: "fetch_payment" }, { status: 404 });
      }
      const p = pm as { id: string; lead_id: string; conversation_id: string | null; amount_inr: number };

      currentStep = "update_payment";
      console.log(`[simulate/payment] step: update_payment → paid`);
      await svc.from("payments").update({ status: "paid", updated_at: now }).eq("id", paymentId);

      currentStep = "update_lead_stage";
      console.log(`[simulate/payment] step: update_lead_stage → won`);
      await svc.from("leads").update({ stage: "won", updated_at: now }).eq("id", p.lead_id);

      currentStep = "inngest_send";
      console.log("[simulate/payment] step: inngest_send  event=payment.captured");
      await inngest.send({
        name: "payment.captured",
        data: {
          orgId,
          paymentId:      p.id,
          leadId:         p.lead_id,
          conversationId: p.conversation_id,
          amountInr:      p.amount_inr,
        },
      });
      console.log("[simulate/payment] ✓ payment.captured emitted");

      return NextResponse.json({ ok: true });
    }

    // ════════════════════════════════════════════════════════════
    // ── UNPAID (trigger dunning immediately) ─────────────────────
    // ════════════════════════════════════════════════════════════
    if (action === "unpaid") {
      if (!paymentId)
        return NextResponse.json({ error: "paymentId required", step: "validate" }, { status: 400 });

      currentStep = "fetch_payment";
      console.log(`[simulate/payment] step: fetch_payment  id=${paymentId}`);
      const { data: pm, error: pmErr } = await svc
        .from("payments")
        .select("id, lead_id, conversation_id")
        .eq("id", paymentId)
        .eq("org_id", orgId)
        .single();

      if (pmErr) {
        console.error("[simulate/payment] fetch_payment error:", pmErr.message);
        return NextResponse.json({ error: pmErr.message, step: "fetch_payment" }, { status: 500 });
      }
      if (!pm) {
        return NextResponse.json({ error: "Payment not found", step: "fetch_payment" }, { status: 404 });
      }
      const p = pm as { id: string; lead_id: string; conversation_id: string | null };

      currentStep = "inngest_send";
      console.log("[simulate/payment] step: inngest_send  event=payment.unpaid");
      await inngest.send({
        name: "payment.unpaid",
        data: {
          orgId,
          paymentId:      p.id,
          leadId:         p.lead_id,
          conversationId: p.conversation_id,
        },
      });
      console.log("[simulate/payment] ✓ payment.unpaid emitted");

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action — must be create | capture | unpaid", step: "parse_body" }, { status: 400 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[simulate/payment] unhandled error at step "${currentStep}":`, err);
    return NextResponse.json({ error: msg, step: currentStep }, { status: 500 });
  }
}
