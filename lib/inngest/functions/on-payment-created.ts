/**
 * Inngest function: payment.created
 *
 * Fires when a payment link is sent to a lead.
 * Waits X hours — if still pending, emits payment.unpaid to kick off dunning.
 *
 * Env:
 *   TEST_PAYMENT_UNPAID_MS — ms to wait instead of 6h (dev testing)
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";

interface PaymentCreatedData {
  orgId:          string;
  paymentId:      string;
  leadId:         string;
  conversationId: string | null;
}

export const onPaymentCreated = inngest.createFunction(
  {
    id:      "on-payment-created",
    name:    "Payment Created: watch for unpaid timeout",
    retries: 1,
  },
  { event: "payment.created" },
  async ({ event, step }) => {
    const { orgId, paymentId, leadId, conversationId } =
      event.data as PaymentCreatedData;

    const delayMs = process.env.TEST_PAYMENT_UNPAID_MS
      ? parseInt(process.env.TEST_PAYMENT_UNPAID_MS, 10)
      : 6 * 60 * 60 * 1000; // 6 hours

    // Wait for payment to either complete or time out
    await step.sleep("wait-for-payment", delayMs);

    // Check if still pending
    const stillPending = await step.run("check-payment-status", async () => {
      const svc = createServiceClient();
      const { data } = await svc
        .from("payments")
        .select("status")
        .eq("id", paymentId)
        .single();
      return (data as { status: string } | null)?.status === "pending";
    });

    if (!stillPending) {
      console.log(`[payment-created] payment ${paymentId} already resolved — no dunning`);
      return { paymentId, outcome: "resolved" };
    }

    // Still unpaid → emit payment.unpaid to trigger dunning
    await inngest.send({
      name: "payment.unpaid",
      data: { orgId, paymentId, leadId, conversationId },
    });

    return { paymentId, outcome: "unpaid_emitted" };
  }
);
