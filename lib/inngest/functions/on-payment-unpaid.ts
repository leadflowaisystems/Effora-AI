/**
 * Inngest function: payment.unpaid
 *
 * Fires when a payment link hasn't been completed within the timeout.
 * Sends up to 3 dunning follow-ups at spaced intervals.
 * Creates + updates a sequence_run row for UI tracking.
 * After 3 attempts with no payment, flags the run for human review.
 *
 * Env:
 *   TEST_DUNNING_DELAY_MS — ms between attempts instead of 24h (dev testing)
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { sendChannelMessage } from "@/lib/booking";
import { buildDunningMessage } from "@/prompts/dunning";
import { sendEmail } from "@/lib/email";
import { dunningEmail } from "@/lib/email-templates";

interface PaymentUnpaidData {
  orgId:          string;
  paymentId:      string;
  leadId:         string;
  conversationId: string | null;
}

type Attempt = 1 | 2 | 3;

async function isPaid(paymentId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("payments")
    .select("status")
    .eq("id", paymentId)
    .single();
  return (data as { status: string } | null)?.status === "paid";
}

async function updateRun(
  runId: string,
  step: number,
  status?: "active" | "completed" | "stopped" | "flagged"
) {
  const svc = createServiceClient();
  const now = new Date().toISOString();
  await svc.from("sequence_runs").update({
    step_current: step,
    ...(status ? { status } : {}),
    updated_at: now,
  }).eq("id", runId);
}

export const onPaymentUnpaid = inngest.createFunction(
  {
    id:      "on-payment-unpaid",
    name:    "Payment Unpaid: dunning sequence",
    retries: 1,
  },
  { event: "payment.unpaid" },
  async ({ event, step }) => {
    const { orgId, paymentId, leadId, conversationId } =
      event.data as PaymentUnpaidData;

    if (!conversationId) {
      return { skipped: true, reason: "No conversation linked to payment" };
    }

    const delayMs = process.env.TEST_DUNNING_DELAY_MS
      ? parseInt(process.env.TEST_DUNNING_DELAY_MS, 10)
      : 24 * 60 * 60 * 1000; // 24 hours between attempts

    // ── Step 0: Create sequence run + load context ──────────────
    const ctx = await step.run("init-dunning", async () => {
      const svc = createServiceClient();
      const now = new Date().toISOString();

      // Create sequence_run tracking row
      const { data: run } = await svc.from("sequence_runs").insert({
        org_id:          orgId,
        lead_id:         leadId,
        conversation_id: conversationId,
        type:            "dunning",
        status:          "active",
        step_current:    0,
        step_total:      3,
        metadata:        { payment_id: paymentId },
        started_at:      now,
        updated_at:      now,
      }).select("id").single();

      // Load lead + voice profile + payment details
      const [leadRes, voiceRes, paymentRes, orgRes] = await Promise.all([
        svc.from("leads").select("name, metadata").eq("id", leadId).single(),
        svc.from("voice_profiles").select("offer").eq("org_id", orgId).single(),
        svc.from("payments").select("amount_inr, payment_link_url").eq("id", paymentId).single(),
        svc.from("orgs").select("name").eq("id", orgId).single(),
      ]);
      const leadData = leadRes.data as { name: string | null; metadata?: Record<string, unknown> } | null;

      return {
        runId:      (run as { id: string } | null)?.id ?? null,
        leadName:   leadData?.name ?? null,
        leadEmail:  (leadData?.metadata as Record<string, unknown> | undefined)?.email as string | undefined ?? null,
        coachName:  (orgRes.data as { name: string } | null)?.name ?? "Your Coach",
        offer:      (voiceRes.data as { offer: string } | null)?.offer ?? "",
        amountInr:  (paymentRes.data as { amount_inr: number } | null)?.amount_inr ?? 0,
        paymentUrl: (paymentRes.data as { payment_link_url: string | null } | null)?.payment_link_url ?? null,
      };
    });

    if (!ctx.runId) {
      console.error("[dunning] failed to create sequence_run");
      return { skipped: true };
    }

    const send = async (attempt: Attempt) => {
      const msg = buildDunningMessage({
        leadName:   ctx.leadName,
        attempt,
        paymentUrl: ctx.paymentUrl,
        amountInr:  ctx.amountInr,
        coachOffer: ctx.offer,
      });
      await sendChannelMessage(conversationId, orgId, msg, "system");
      if (ctx.leadEmail) {
        await sendEmail({
          to:       ctx.leadEmail,
          subject:  `Payment reminder (attempt ${attempt})`,
          html:     dunningEmail({
            leadName:    ctx.leadName ?? "there",
            daysOverdue: attempt,
            paymentUrl:  ctx.paymentUrl ?? "",
            coachName:   ctx.coachName,
          }),
          orgId,
          template: "dunningEmail",
        }).catch(() => null);
      }
      await updateRun(ctx.runId!, attempt);
    };

    // ── Attempt 1 ───────────────────────────────────────────────
    await step.run("send-dunning-1", () => send(1));
    await step.sleep("wait-dunning-2", delayMs);

    const paid1 = await step.run("check-paid-1", () => isPaid(paymentId));
    if (paid1) {
      await updateRun(ctx.runId, 1, "completed");
      return { outcome: "paid", attempts: 1 };
    }

    // ── Attempt 2 ───────────────────────────────────────────────
    await step.run("send-dunning-2", () => send(2));
    await step.sleep("wait-dunning-3", delayMs);

    const paid2 = await step.run("check-paid-2", () => isPaid(paymentId));
    if (paid2) {
      await updateRun(ctx.runId, 2, "completed");
      return { outcome: "paid", attempts: 2 };
    }

    // ── Attempt 3 (final) ────────────────────────────────────────
    await step.run("send-dunning-3", () => send(3));
    await step.sleep("wait-flag", delayMs);

    const paid3 = await step.run("check-paid-3", () => isPaid(paymentId));
    if (paid3) {
      await updateRun(ctx.runId, 3, "completed");
      return { outcome: "paid", attempts: 3 };
    }

    // Still unpaid after 3 attempts — flag for human
    await step.run("flag-for-human", async () => {
      const svc = createServiceClient();
      const now = new Date().toISOString();
      await svc.from("sequence_runs").update({
        status:      "flagged",
        step_current: 3,
        updated_at:  now,
      }).eq("id", ctx.runId!);

      await svc.from("payments").update({
        notes:      "Flagged after 3 dunning attempts — needs human follow-up.",
        updated_at: now,
      }).eq("id", paymentId);
    });

    console.log(`[dunning] payment ${paymentId} flagged after 3 attempts`);
    return { outcome: "flagged", attempts: 3 };
  }
);
