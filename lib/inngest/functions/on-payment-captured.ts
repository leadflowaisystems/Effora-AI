/**
 * Inngest function: payment.captured
 *
 * Sends the payment receipt after a Razorpay webhook capture.
 *
 * The Razorpay webhook emits payment.captured but nothing consumed it, so a
 * webhook-captured payment never produced the receipt that the manual
 * mark-paid path sends. This closes that gap.
 *
 * It deliberately runs OUTSIDE the webhook request: the receipt needs an LLM
 * call plus a WhatsApp Graph send (~2–4s from iad1), which does not fit
 * comfortably inside Razorpay's delivery timeout. Inngest also retries a failed
 * receipt, which an inline send could not — a timed-out webhook retry would hit
 * the capture compare-and-swap, no-op, and never re-send.
 *
 * Exactly-once: the webhook's atomic capture guarantees a single emit per
 * payment, and the send carries id=`payment-captured-<paymentId>` so Inngest
 * will not start a second run even if the event is emitted twice. Within a run,
 * step.run memoises each step across retries.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { generatePaymentReceivedMessage } from "@/lib/ai";
import { getOrCreateConversation, deliverOutboundMessage } from "@/lib/conversation";
import { templateCustomerName, templateAmountInr, templateDescription } from "@/lib/whatsapp-templates";
import { getLeadFirstName } from "@/lib/leads";
import { sendEmail } from "@/lib/email";
import { paymentReceived } from "@/lib/email-templates";

interface PaymentCapturedData {
  orgId:          string;
  paymentId:      string;
  leadId:         string;
  conversationId: string | null;
  amountInr:      number;
  description?:   string;
}

export const onPaymentCaptured = inngest.createFunction(
  {
    id:      "on-payment-captured",
    name:    "Payment Captured: send receipt",
    retries: 2,
  },
  { event: "payment.captured" },
  async ({ event, step }) => {
    const { orgId, paymentId, leadId, conversationId, amountInr, description } =
      event.data as PaymentCapturedData;

    // One resolved description for the AI prompt, the fallback copy, the receipt
    // email and the template parameter, so they can never drift apart.
    const receiptDescription = templateDescription(description);

    // ── 1. Load everything the receipt needs ────────────────────
    const ctx = await step.run("load-receipt-context", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = createServiceClient() as any;
      const [leadRes, vpRes, orgRes] = await Promise.all([
        svc.from("leads")
          .select("name, external_id, channel, metadata")
          .eq("id", leadId).eq("org_id", orgId).maybeSingle(),
        svc.from("voice_profiles")
          .select("tone, offer, price_range, sells, objections, extra_context")
          .eq("org_id", orgId).maybeSingle(),
        svc.from("orgs").select("name").eq("id", orgId).maybeSingle(),
      ]);

      const lead = leadRes.data as {
        name: string | null; external_id: string | null;
        channel: string | null; metadata?: Record<string, unknown>;
      } | null;

      if (!lead) return null;   // lead deleted between capture and receipt

      return {
        firstName: getLeadFirstName({ name: lead.name, external_id: lead.external_id }),
        channel:   lead.channel ?? "manual",
        email:     ((lead.metadata?.email) as string | undefined) ?? null,
        vp:        vpRes.data ?? null,
        orgName:   (orgRes.data as { name: string } | null)?.name ?? "Your Coach",
      };
    });

    if (!ctx) {
      console.warn(`[on-payment-captured] lead ${leadId} not found — skipping receipt for payment=${paymentId}`);
      return { skipped: "lead_not_found" };
    }

    // ── 2. Receipt message into the lead's own thread ───────────
    const messageResult = await step.run("send-receipt-message", async () => {
      // Prefer the conversation the payment link was sent on. Fall back to the
      // lead's real channel — hardcoding "manual" would file the receipt in a
      // manual_crm thread instead of the WhatsApp/Instagram one.
      const provider =
        ctx.channel === "whatsapp" || ctx.channel === "whatsapp_cloud" ? "whatsapp_cloud" :
        ctx.channel === "instagram" ? "meta_instagram" : "manual";
      const convId = conversationId ?? await getOrCreateConversation(orgId, leadId, provider);

      const aiMsg = await generatePaymentReceivedMessage({
        leadFirstName: ctx.firstName,
        amountInr,
        description:   receiptDescription,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        voiceProfile:  ctx.vp as any,
        orgId,
      }).catch(() => ({
        content: `Payment received${ctx.firstName ? `, ${ctx.firstName}` : ""}. ` +
                 `${templateAmountInr(amountInr)} confirmed for ${receiptDescription}. ` +
                 `Welcome — I'll send the next steps shortly.`,
      }));

      // effora_payment_received params, used only outside the 24-hour window:
      // {{1}} customer name, {{2}} formatted amount, {{3}} description. Built
      // from the same values the prose was built from — never parsed back out of
      // the rendered message.
      const { delivered } = await deliverOutboundMessage(
        convId, orgId, aiMsg.content, "payment_received",
        [templateCustomerName(ctx.firstName), templateAmountInr(amountInr), receiptDescription],
      );
      console.log(`[on-payment-captured] receipt delivered=${delivered} conv=${convId} payment=${paymentId}`);
      return { conversationId: convId, delivered };
    });

    // ── 3. Receipt email (only when we have an address) ─────────
    if (ctx.email) {
      await step.run("send-receipt-email", async () => {
        await sendEmail({
          to:      ctx.email as string,
          subject: "Payment received — welcome!",
          html:    paymentReceived({
            leadName:    ctx.firstName || "there",
            amount:      templateAmountInr(amountInr),
            description: receiptDescription,
            coachName:   ctx.orgName,
          }),
          orgId,
          leadId,
          template: "paymentReceived",
        });
        return { sent: true };
      });
    }

    return { paymentId, ...messageResult, emailed: !!ctx.email };
  },
);
