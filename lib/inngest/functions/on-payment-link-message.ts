/**
 * Inngest function: payment.link-message
 *
 * Fires immediately after a payment link is created (dev simulate or production
 * AI-initiated offer). Generates a short AI message with the payment URL and
 * posts it to the lead's conversation thread.
 *
 * Steps:
 *   1. load-context          — fetch payment, lead, voice profile
 *   2. generate-link-msg     — call LLM (or template fallback) with payment details
 *   3. insert-message        — write outbound message row, update conversation preview
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { generatePaymentLinkMessage } from "@/lib/ai";
import { getLeadFirstName } from "@/lib/leads";
import { sendEmail } from "@/lib/email";
import { paymentLink as paymentLinkTemplate } from "@/lib/email-templates";

interface PaymentLinkMessageData {
  orgId:        string;
  paymentId:    string;
  /** Optional: description of what the payment is for (e.g. "3-month coaching"). */
  description?: string | null;
}

export const onPaymentLinkMessage = inngest.createFunction(
  {
    id:      "on-payment-link-message",
    name:    "Payment: send AI link message",
    retries: 1,
  },
  { event: "payment.link-message" },
  async ({ event, step }) => {
    const { orgId, paymentId, description } = event.data as PaymentLinkMessageData;

    // ── 1. Load payment + lead + voice ────────────────────────────
    const ctx = await step.run("load-context", async () => {
      const svc = createServiceClient();

      const [paymentRes, voiceRes] = await Promise.all([
        svc.from("payments")
           .select("lead_id, conversation_id, amount_inr, payment_link_url")
           .eq("id", paymentId)
           .single(),
        svc.from("voice_profiles")
           .select("tone, offer")
           .eq("org_id", orgId)
           .single(),
      ]);

      const payment = paymentRes.data as {
        lead_id:          string;
        conversation_id:  string | null;
        amount_inr:       number;
        payment_link_url: string | null;
      } | null;

      if (!payment) {
        console.error(`[payment-link-msg] payment ${paymentId} not found`);
        return null;
      }
      if (!payment.conversation_id) {
        console.log(`[payment-link-msg] payment ${paymentId} has no conversation — skipping`);
        return null;
      }
      if (!payment.payment_link_url) {
        console.log(`[payment-link-msg] payment ${paymentId} has no URL — skipping`);
        return null;
      }

      const leadRes = await svc.from("leads")
        .select("name, external_id")
        .eq("id", payment.lead_id)
        .single();

      const lead = leadRes.data as { name: string | null; external_id: string | null; metadata?: Record<string, unknown> } | null;
      const orgRes = await svc.from("orgs").select("name").eq("id", orgId).single();

      return {
        leadId:         payment.lead_id,
        conversationId: payment.conversation_id,
        amountInr:      payment.amount_inr,
        paymentUrl:     payment.payment_link_url,
        leadName:       lead?.name       ?? null,
        leadExternalId: lead?.external_id ?? null,
        leadEmail:      (lead?.metadata as Record<string, unknown> | undefined)?.email as string | undefined ?? null,
        voice:          voiceRes.data as { tone: string; offer: string } | null,
        coachName:      (orgRes.data as { name: string } | null)?.name ?? "Your Coach",
      };
    });

    if (!ctx) {
      return { skipped: true, reason: "No payment / conversation / URL found" };
    }

    // ── 2. Generate payment link message ──────────────────────────
    const content = await step.run("generate-link-msg", async () => {
      const firstName = getLeadFirstName({ name: ctx.leadName, external_id: ctx.leadExternalId });
      // Use passed description → voice profile offer → generic fallback
      const desc = description || ctx.voice?.offer || "the program";

      const result = await generatePaymentLinkMessage({
        leadFirstName: firstName,
        amountInr:     ctx.amountInr,
        description:   desc,
        paymentUrl:    ctx.paymentUrl,
        voiceProfile:  ctx.voice
          ? {
              tone:          ctx.voice.tone,
              offer:         ctx.voice.offer,
              price_range:   "",
              sells:         "",
              objections:    [],
              extra_context: "",
            }
          : null,
        orgId,
      });

      console.log(`[payment-link-msg] generated: "${result.content.slice(0, 80)}…"`);
      return result.content;
    });

    // ── 3. Insert message + update conversation preview ───────────
    await step.run("insert-message", async () => {
      const svc = createServiceClient();
      const now = new Date().toISOString();

      await svc.from("messages").insert({
        conversation_id: ctx.conversationId,
        org_id:          orgId,
        direction:       "outbound",
        content,
        sent_at:         now,
        metadata:        { source: "payment_link" },
      });

      await svc.from("conversations").update({
        last_message_at:      now,
        last_message_preview: content.slice(0, 80),
      }).eq("id", ctx.conversationId);

      console.log(`[payment-link-msg] message inserted for conv ${ctx.conversationId}`);

      // Send transactional email if lead has email
      if (ctx.leadEmail) {
        const firstName = getLeadFirstName({ name: ctx.leadName, external_id: ctx.leadExternalId });
        const desc = description || ctx.voice?.offer || "the program";
        await sendEmail({
          to:       ctx.leadEmail,
          subject:  "Your payment link is ready",
          html:     paymentLinkTemplate({
            leadName:    firstName,
            amount:      `₹${ctx.amountInr.toLocaleString("en-IN")}`,
            description: desc,
            paymentUrl:  ctx.paymentUrl ?? "",
            coachName:   ctx.coachName,
          }),
          orgId,
          template: "paymentLink",
        }).catch(() => null);
      }
    });

    return { paymentId, conversationId: ctx.conversationId, sent: true };
  },
);
