/**
 * Inngest function: whatsapp.message_received
 *
 * Same flow as on-dm-received but fires the WhatsApp Cloud API send path.
 * Steps: load-context → qualify-lead → update-lead → draft-reply → save-or-send
 */

import { inngest }              from "../client";
import { createServiceClient }  from "@/lib/supabase/server";
import { qualifyLead, draftReply } from "@/lib/ai";
import { getCalLink, embedMetadataInCalLink } from "@/lib/booking";
import { sendWhatsAppMessage }  from "@/lib/integrations/whatsapp-cloud";

interface WAMessageData {
  orgId:          string;
  leadId:         string;
  conversationId: string;
  messageId:      string;
  senderPhone:    string;
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
    const { orgId, leadId, conversationId, messageId, senderPhone } = event.data as WAMessageData;

    // ── 1. Load context ──────────────────────────────────────────────────────
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

    // ── 2. Qualify ───────────────────────────────────────────────────────────
    const qualification = await step.run("qualify-lead", async () => {
      return qualifyLead({ messages: ctx.messages, voiceProfile: ctx.voiceProfile, orgId });
    });

    // ── 3. Persist score + stage ─────────────────────────────────────────────
    await step.run("update-lead", async () => {
      const svc = createServiceClient();
      const now = new Date().toISOString();
      await svc.from("leads").update({
        score:        qualification.score,
        stage:        qualification.stage,
        last_seen_at: now,
        updated_at:   now,
      }).eq("id", leadId);
    });

    // ── 4 + 5. Draft + save/send (warm or hot only) ──────────────────────────
    if (qualification.stage === "hot" || qualification.stage === "warm") {
      const calLinkForDraft = qualification.stage === "hot" && ctx.calLink
        ? embedMetadataInCalLink(ctx.calLink, conversationId, leadId)
        : null;

      const draft = await step.run("draft-reply", async () => {
        return draftReply({
          messages:     ctx.messages,
          voiceProfile: ctx.voiceProfile,
          score:        qualification.score,
          stage:        qualification.stage,
          orgId,
          calLink:      calLinkForDraft,
        });
      });

      await step.run("save-or-send", async () => {
        const svc = createServiceClient();
        const now = new Date().toISOString();

        // Check per-conversation override
        const { data: convRow } = await svc
          .from("conversations")
          .select("auto_reply_enabled")
          .eq("id", conversationId)
          .single();
        const autoReply = (convRow as { auto_reply_enabled: boolean } | null)?.auto_reply_enabled
          ?? ctx.org?.auto_send_replies;

        if (autoReply) {
          // Send via WhatsApp Cloud API then record
          try {
            await sendWhatsAppMessage(orgId, senderPhone, draft.content);
          } catch (e) {
            console.error("[wa-inngest] sendWhatsAppMessage failed:", e);
          }

          await svc.from("messages").insert({
            conversation_id: conversationId,
            org_id:          orgId,
            direction:       "outbound",
            content:         draft.content,
            sent_at:         now,
            metadata:        { source: "ai_whatsapp", model: process.env.LLM_MODEL_SMART ?? "llama-3.3-70b-versatile" },
          });

          await svc.from("ai_drafts").insert({
            conversation_id: conversationId,
            org_id:          orgId,
            message_id:      messageId,
            content:         draft.content,
            status:          "sent",
          });

          await svc.from("conversations").update({
            last_message_at:      now,
            last_message_preview: `[AI] ${draft.content.slice(0, 78)}`,
          }).eq("id", conversationId);

          if (qualification.stage === "hot" && calLinkForDraft) {
            await svc.from("leads").update({ stage: "booking_sent", updated_at: now }).eq("id", leadId);
          }
        } else {
          await svc.from("ai_drafts").insert({
            conversation_id: conversationId,
            org_id:          orgId,
            message_id:      messageId,
            content:         draft.content,
            status:          "pending",
          });
        }
      });
    }

    return {
      score:   qualification.score,
      stage:   qualification.stage,
      drafted: qualification.stage === "hot" || qualification.stage === "warm",
    };
  },
);
