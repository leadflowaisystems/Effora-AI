/**
 * Inngest function: payment.captured
 *
 * The Razorpay webhook (app/api/webhooks/razorpay/[orgId]/route.ts) and the
 * payment simulator both emit `payment.captured`, but until now nothing
 * consumed it — the event was fired into the void.
 *
 * This function notifies the institute owner that money has landed. It does
 * NOT mutate payment or lead state: the webhook has already marked the payment
 * paid and advanced the lead to "won" before emitting. Keeping this read-only
 * means a retry can never double-apply anything.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyPaymentCaptured } from "@/lib/notify";

interface PaymentCapturedData {
  orgId:          string;
  paymentId:      string;
  leadId:         string;
  conversationId: string | null;
  amountInr:      number;
}

export const onPaymentCaptured = inngest.createFunction(
  {
    id:      "on-payment-captured",
    name:    "Payment Captured: notify owner",
    retries: 1,
  },
  { event: "payment.captured" },
  async ({ event, step }) => {
    const { orgId, leadId, conversationId, amountInr } =
      event.data as PaymentCapturedData;

    const leadName = await step.run("load-lead-name", async () => {
      try {
        const svc = createServiceClient();
        const { data } = await svc
          .from("leads")
          .select("name")
          .eq("id", leadId)
          .maybeSingle();
        return (data as { name: string | null } | null)?.name ?? null;
      } catch {
        // A missing name must not stop the notification — it degrades to "Someone".
        return null;
      }
    });

    await step.run("notify-payment-captured", async () => {
      await notifyPaymentCaptured({
        orgId,
        leadName,
        amountInr,
        conversationId,
      });
      return { notified: true };
    });

    return { notified: true, amountInr };
  },
);
