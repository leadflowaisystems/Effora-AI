/**
 * Inngest cron: recurring-payment-cron
 *
 * Runs every hour. Finds active recurring payment templates whose next_run_at
 * has arrived, creates a normal one_time payment instance for each, then
 * advances next_run_at so the template is not picked up again until the
 * next period.
 *
 * Idempotency: the template row is updated (next_run_at advanced) inside the
 * same step.run that reads it. The UPDATE WHERE next_run_at <= NOW() acts as
 * an atomic claim — a second concurrent worker will find 0 matching rows and
 * skip cleanly.
 *
 * Does NOT touch WhatsApp / Instagram / delivery infrastructure.
 * Message delivery is delegated to the existing payment.link-message event.
 */

import { inngest }             from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { createPaymentLink }   from "@/lib/razorpay";
import { getOrCreateConversation } from "@/lib/conversation";

// ── Helper: compute the next run date given a frequency ──────────────────────

function nextRunDate(from: Date, frequency: string): Date {
  const d = new Date(from);
  switch (frequency) {
    case "daily":   d.setDate(d.getDate() + 1);         break;
    case "weekly":  d.setDate(d.getDate() + 7);         break;
    case "monthly": d.setMonth(d.getMonth() + 1);       break;
    case "yearly":  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecurringTemplate {
  id:                   string;
  org_id:               string;
  lead_id:              string;
  amount_inr:           number;
  notes:                string | null;
  template_name:        string | null;
  recurrence_frequency: string;
  next_run_at:          string;
}

// ── Inngest function ──────────────────────────────────────────────────────────

export const onRecurringPaymentCron = inngest.createFunction(
  {
    id:      "on-recurring-payment-cron",
    name:    "Recurring payments: generate due instances",
    retries: 1,
  },
  { cron: "0 * * * *" }, // every hour on the hour
  async ({ step }) => {
    // ── 1. Find due templates ──────────────────────────────────────────────
    const templates = await step.run("find-due-templates", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = createServiceClient() as any;
      const { data } = await svc
        .from("payments")
        .select("id, org_id, lead_id, amount_inr, notes, template_name, recurrence_frequency, next_run_at")
        .eq("payment_type", "recurring")
        .eq("template_active", true)
        .is("deleted_at", null)
        .lte("next_run_at", new Date().toISOString())
        .limit(50); // safety cap
      return (data ?? []) as RecurringTemplate[];
    });

    if (templates.length === 0) return { processed: 0 };

    let processed = 0;
    let errors    = 0;

    for (const tpl of templates) {
      await step.run(`process-template-${tpl.id}`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svc = createServiceClient() as any;
        const now = new Date();

        // ── Atomic claim: advance next_run_at before creating instance ──────
        // If two workers race, only one will find next_run_at <= NOW() after
        // the first worker has already advanced it.
        const next = nextRunDate(new Date(tpl.next_run_at), tpl.recurrence_frequency);
        const { data: claimed } = await svc
          .from("payments")
          .update({ last_run_at: now.toISOString(), next_run_at: next.toISOString(), updated_at: now.toISOString() })
          .eq("id", tpl.id)
          .eq("payment_type", "recurring")
          .eq("template_active", true)
          .lte("next_run_at", now.toISOString())  // re-check the condition
          .select("id");

        if (!claimed || claimed.length === 0) {
          // Another worker already claimed this template — skip
          console.log(`[recurring-payment] template ${tpl.id} already claimed, skipping`);
          return;
        }

        try {
          // ── Load lead + org ─────────────────────────────────────────────
          const [leadRes, orgRes, rzpRes] = await Promise.all([
            svc.from("leads").select("id, name, channel, metadata").eq("id", tpl.lead_id).single(),
            svc.from("orgs").select("id, name, upi_id").eq("id", tpl.org_id).single(),
            svc.from("integrations").select("config, active")
              .eq("org_id", tpl.org_id).eq("provider", "razorpay").eq("active", true).maybeSingle(),
          ]);

          const lead     = leadRes.data  as { id: string; name: string | null; channel: string; metadata: Record<string, unknown> | null } | null;
          const org      = orgRes.data   as { id: string; name: string; upi_id: string | null } | null;
          const hasRzp   = !!rzpRes.data?.active;
          const hasUpi   = !!org?.upi_id;

          if (!lead || !org) {
            console.error(`[recurring-payment] lead/org not found for template ${tpl.id}`);
            errors++;
            return;
          }

          const description = tpl.template_name ?? tpl.notes ?? "Recurring payment";

          // ── Generate payment link (same logic as link-generate route) ────
          let linkUrl    = "";
          let linkMethod = "upi";

          if (hasRzp) {
            try {
              const result = await createPaymentLink({
                orgId:        tpl.org_id,
                amountInr:    tpl.amount_inr,
                description,
                customerName: lead.name ?? undefined,
                referenceId:  `rec_${tpl.id.slice(0, 8)}_${Date.now()}`,
              });
              linkUrl    = result?.shortUrl ?? "";
              linkMethod = "razorpay";
            } catch (e) {
              console.warn(`[recurring-payment] Razorpay failed for ${tpl.id}:`, e);
            }
          }

          if (!linkUrl && hasUpi && org.upi_id) {
            const pa = encodeURIComponent(org.upi_id);
            const pn = encodeURIComponent(org.name ?? "Coach");
            const am = encodeURIComponent(String(tpl.amount_inr));
            const tn = encodeURIComponent(description);
            linkUrl    = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&tn=${tn}&cu=INR`;
            linkMethod = "upi";
          }

          if (!linkUrl) {
            console.error(`[recurring-payment] no payment method for org ${tpl.org_id} template ${tpl.id}`);
            errors++;
            return;
          }

          // ── Get/create conversation (reuse lead's channel) ───────────────
          const lc = lead.channel?.toLowerCase() ?? "manual";
          const convProvider =
            lc === "whatsapp" || lc === "whatsapp_cloud" ? "whatsapp_cloud" :
            lc === "instagram" ? "meta_instagram" : "manual_crm";
          const conversationId = await getOrCreateConversation(tpl.org_id, tpl.lead_id, convProvider);

          // ── Create one_time payment instance ─────────────────────────────
          const { data: instance, error: insErr } = await svc.from("payments").insert({
            org_id:              tpl.org_id,
            lead_id:             tpl.lead_id,
            amount_inr:          tpl.amount_inr,
            status:              "pending",
            payment_link_url:    linkUrl,
            link_url:            linkUrl,
            link_method:         linkMethod,
            notes:               description,
            source:              linkMethod,
            conversation_id:     conversationId,
            payment_type:        "one_time",
            template_payment_id: tpl.id,
            created_at:          now.toISOString(),
            updated_at:          now.toISOString(),
          }).select("id").single();

          if (insErr || !instance) {
            console.error(`[recurring-payment] failed to create instance for ${tpl.id}:`, insErr?.message);
            errors++;
            return;
          }

          const instanceId = (instance as { id: string }).id;

          // ── Fire payment.link-message so the message is delivered ────────
          await inngest.send({
            name: "payment.link-message",
            data: { orgId: tpl.org_id, paymentId: instanceId, description },
          });

          // ── Fire payment.created to start unpaid watcher ─────────────────
          await inngest.send({
            name: "payment.created",
            data: { orgId: tpl.org_id, paymentId: instanceId, leadId: tpl.lead_id, conversationId },
          });

          console.log(`[recurring-payment] created instance ${instanceId} for template ${tpl.id}`);
          processed++;
        } catch (err) {
          console.error(`[recurring-payment] unexpected error for template ${tpl.id}:`, err);
          errors++;
        }
      });
    }

    return { processed, errors, total: templates.length };
  },
);
