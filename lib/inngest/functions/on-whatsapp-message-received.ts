/**
 * Inngest function: whatsapp.message_received
 *
 * Same flow as on-dm-received but fires the WhatsApp Cloud API send path.
 *
 * Steps (reduced from 5 → 2 for latency):
 *   1. load-context      — parallel DB reads + Cal.com link
 *   2. qualify-and-reply — qualify (fast model) → if warm/hot: draft+send in same step
 *                          (eliminates 3 Inngest step round-trips vs original 5-step design)
 */

import { inngest }              from "../client";
import { createServiceClient }  from "@/lib/supabase/server";
import { qualifyLead, draftReply } from "@/lib/ai";
import { getCalLink, embedMetadataInCalLink } from "@/lib/booking";
import { deliverOutboundMessage } from "@/lib/conversation";
import { notifyNewLead, notifyHotLead } from "@/lib/notify";

interface WAMessageData {
  orgId:          string;
  leadId:         string;
  conversationId: string;
  messageId:      string;
  senderPhone:    string;
  isNewLead?:     boolean;
  leadName?:      string | null;
}

export const onWhatsAppMessageReceived = inngest.createFunction(
  {
    id:      "on-whatsapp-message-received",
    name:    "WhatsApp: qualify + draft",
    retries: 1,
    throttle: { limit: 10, period: "1m", key: "event.data.orgId" },
  },
  { event: "whatsapp.message_received" },
  async ({ event, step }) => {
    const {
      orgId, leadId, conversationId, messageId,
      senderPhone: _senderPhone, isNewLead, leadName,
    } = event.data as WAMessageData;

    // ── 1. Load context (parallel DB + Cal.com) ──────────────────────────────
    const ctx = await step.run("load-context", async () => {
      const svc = createServiceClient();

      const [orgRes, leadRes, msgRes, voiceRes, calLinkRes] = await Promise.all([
        svc.from("orgs").select("id, auto_send_replies, active_channel").eq("id", orgId).single(),
        svc.from("leads").select("id, score, stage, channel").eq("id", leadId).single(),
        svc.from("messages")
          .select("direction, content, sent_at")
          .eq("conversation_id", conversationId)
          .order("sent_at", { ascending: true }),
        svc.from("voice_profiles")
          .select("tone, offer, price_range, sells, objections, extra_context")
          .eq("org_id", orgId)
          .single(),
        getCalLink(orgId),
      ]);

      return {
        org:   orgRes.data  as { id: string; auto_send_replies: boolean; active_channel: string } | null,
        lead:  leadRes.data as { id: string; score: number; stage: string } | null,
        messages: (msgRes.data ?? []) as { direction: "inbound" | "outbound"; content: string; sent_at: string }[],
        voiceProfile: voiceRes.data as {
          tone: string; offer: string; price_range: string;
          sells: string; objections: string[]; extra_context: string;
        } | null,
        calLink: calLinkRes as string | null,
      };
    });

    if (!ctx.org || !ctx.lead || ctx.messages.length === 0) {
      return { skipped: true, reason: "Missing context" };
    }

    // ── 1b. Notify the owner of a brand-new enquiry ──────────────────────────
    // Deliberately its own step: a push failure must never cause the qualify /
    // draft / send step to retry. notify* helpers never throw (lib/notify.ts).
    const latestInbound = [...ctx.messages].reverse().find((m) => m.direction === "inbound");
    if (isNewLead) {
      await step.run("notify-new-lead", async () => {
        await notifyNewLead({
          orgId,
          leadName,
          channel:        "whatsapp_cloud",
          messageText:    latestInbound?.content ?? null,
          conversationId,
        });
        return { notified: true };
      });
    }

    const previousStage = ctx.lead.stage;

    // ── 2. Qualify → (if warm/hot) draft + send — all in ONE step ───────────
    //    Merging qualify, update-lead, draft-reply and save-or-send into a single
    //    Inngest step eliminates 3 step-boundary round-trips (~150–600ms saved).
    const result = await step.run("qualify-and-reply", async () => {
      const svc = createServiceClient();
      const now = new Date().toISOString();

      // ── Step timing ──────────────────────────────────────────────────────
      // Emitted as [ai-timing] so p50 per stage can be read straight from
      // Vercel logs without extra infrastructure.
      const tStart = Date.now();
      let tMark = tStart;
      const t: Record<string, number> = {};
      const lap = (label: string) => { const n = Date.now(); t[label] = n - tMark; tMark = n; };

      // 2a. Qualify
      const qualification = await qualifyLead({
        messages:     ctx.messages,
        voiceProfile: ctx.voiceProfile,
        orgId,
      });
      lap("qualify");

      // 2b. Persist score + stage immediately after qualify
      await svc.from("leads").update({
        score:        qualification.score,
        stage:        qualification.stage,
        last_seen_at: now,
        updated_at:   now,
      }).eq("id", leadId);

      // 2c. Draft + send only for warm / hot leads
      if (qualification.stage !== "hot" && qualification.stage !== "warm") {
        console.log(
          `[ai-timing] wa cold-exit total=${Date.now() - tStart}ms ` +
          Object.entries(t).map(([k, v]) => `${k}=${v}ms`).join(" "),
        );
        return { score: qualification.score, stage: qualification.stage, drafted: false };
      }

      const calLinkForDraft = qualification.stage === "hot" && ctx.calLink
        ? embedMetadataInCalLink(ctx.calLink, conversationId, leadId)
        : null;

      // 2d. Check per-conversation auto-reply override
      const { data: convRow } = await svc
        .from("conversations")
        .select("auto_reply_enabled")
        .eq("id", conversationId)
        .single();
      const autoReply =
        (convRow as { auto_reply_enabled: boolean } | null)?.auto_reply_enabled
        ?? ctx.org?.auto_send_replies;

      lap("persist_and_conv_lookup");

      // 2e. Draft
      const draft = await draftReply({
        messages:     ctx.messages,
        voiceProfile: ctx.voiceProfile,
        score:        qualification.score,
        stage:        qualification.stage,
        orgId,
        calLink:      calLinkForDraft,
      });
      lap("draft");

      if (autoReply) {
        // deliverOutboundMessage sends via WA Cloud API AND stores message to DB atomically
        const { delivered, provider_message_id } = await deliverOutboundMessage(
          conversationId, orgId, draft.content, "ai_whatsapp"
        );
        console.log(`[wa-inngest] ai reply delivered=${delivered} provider_message_id=${provider_message_id ?? "null"} conv=${conversationId}`);

        await svc.from("ai_drafts").insert({
          conversation_id: conversationId,
          org_id:          orgId,
          message_id:      messageId,
          content:         draft.content,
          status:          "sent",
        });

        if (qualification.stage === "hot" && calLinkForDraft) {
          await svc.from("leads").update({ stage: "booking_sent", updated_at: now }).eq("id", leadId);
        }
      } else {
        // Save as pending draft for manual review
        await svc.from("ai_drafts").insert({
          conversation_id: conversationId,
          org_id:          orgId,
          message_id:      messageId,
          content:         draft.content,
          status:          "pending",
        });
      }

      lap("deliver_and_persist");

      // Webhook-to-here latency, using the Inngest event timestamp as t0.
      const eventTs = typeof event.ts === "number" ? event.ts : null;
      const e2e = eventTs ? Date.now() - eventTs : null;
      console.log(
        `[ai-timing] wa total=${Date.now() - tStart}ms ` +
        (e2e !== null ? `e2e_from_event=${e2e}ms ` : "") +
        Object.entries(t).map(([k, v]) => `${k}=${v}ms`).join(" ") +
        ` stage=${qualification.stage} sent=${autoReply}`,
      );

      return {
        score:   qualification.score,
        stage:   qualification.stage,
        drafted: true,
        sent:    autoReply,
      };
    });

    // ── 3. Notify the owner of a HOT lead ────────────────────────────────────
    // Runs after the reply step so a push failure cannot re-send the AI reply.
    // Fires only on the transition into "hot", not on every subsequent message.
    if (result.stage === "hot" && previousStage !== "hot") {
      await step.run("notify-hot-lead", async () => {
        await notifyHotLead({
          orgId,
          leadName,
          messageText:    latestInbound?.content ?? null,
          conversationId,
        });
        return { notified: true };
      });
    }

    return result;
  },
);
