/**
 * Inngest cron: scheduled-payment-cron
 *
 * Runs every 5 minutes. Finds pending payments whose scheduled_at has arrived,
 * fires the existing payment.link-message event to deliver them, then clears
 * scheduled_at as the idempotency marker (so this payment is never picked up
 * again even if the cron fires twice).
 *
 * Does NOT touch WhatsApp / Instagram / delivery infrastructure.
 * Message delivery is delegated to the existing on-payment-link-message function.
 */

import { inngest }             from "../client";
import { createServiceClient } from "@/lib/supabase/server";

interface ScheduledPayment {
  id:     string;
  org_id: string;
  lead_id: string;
  notes:  string | null;
}

export const onScheduledPaymentCron = inngest.createFunction(
  {
    id:      "on-scheduled-payment-cron",
    name:    "Scheduled payments: deliver due payments",
    retries: 1,
  },
  { cron: "*/5 * * * *" }, // every 5 minutes
  async ({ step }) => {
    // ── 1. Find due scheduled payments ────────────────────────────────────
    const payments = await step.run("find-due-scheduled-payments", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = createServiceClient() as any;
      const { data } = await svc
        .from("payments")
        .select("id, org_id, lead_id, notes")
        .eq("status", "pending")
        .is("deleted_at", null)
        .not("scheduled_at", "is", null)
        .lte("scheduled_at", new Date().toISOString())
        .limit(50);
      return (data ?? []) as ScheduledPayment[];
    });

    if (payments.length === 0) return { processed: 0 };

    let processed = 0;
    let errors    = 0;

    for (const payment of payments) {
      await step.run(`deliver-scheduled-${payment.id}`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svc = createServiceClient() as any;
        const now = new Date();

        // Atomic claim: clear scheduled_at so a concurrent worker won't pick it up.
        // The UPDATE WHERE scheduled_at IS NOT NULL AND scheduled_at <= NOW() acts
        // as the guard — a second worker will find the field already NULL and skip.
        const { data: claimed } = await svc
          .from("payments")
          .update({ scheduled_at: null, updated_at: now.toISOString() })
          .eq("id", payment.id)
          .eq("status", "pending")
          .not("scheduled_at", "is", null)
          .lte("scheduled_at", now.toISOString())
          .select("id");

        if (!claimed || claimed.length === 0) {
          console.log(`[scheduled-payment] payment ${payment.id} already claimed, skipping`);
          return;
        }

        try {
          await inngest.send({
            name: "payment.link-message",
            data: { orgId: payment.org_id, paymentId: payment.id, description: payment.notes ?? "Payment link" },
          });
          console.log(`[scheduled-payment] fired payment.link-message for ${payment.id}`);
          processed++;
        } catch (err) {
          console.error(`[scheduled-payment] failed to fire event for ${payment.id}:`, err);
          errors++;
        }
      });
    }

    return { processed, errors, total: payments.length };
  },
);
