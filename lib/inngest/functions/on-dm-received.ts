/**
 * Inngest function: dm.received
 *
 * Fires whenever a new inbound DM is created.
 * Steps:
 *   1. load-context     — fetch messages, voice profile, org, lead, Cal.com link
 *   2. qualify-lead     — score 0-100, derive stage cold/warm/hot
 *   3. update-lead      — persist score + stage
 *   4. draft-reply      — if warm/hot: generate reply in org voice
 *                         (hot replies embed the Cal.com booking link)
 *   5. save-or-send     — auto-send (if org.auto_send_replies) or queue as pending draft;
 *                         hot leads that get auto-sent are promoted to 'booking_sent'
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { qualifyLead, draftReply } from "@/lib/ai";
import { getCalLink, embedMetadataInCalLink } from "@/lib/booking";

interface DmReceivedData {
  orgId:          string;
  leadId:         string;
  conversationId: string;
  messageId:      string;
}

export const onDmReceived = inngest.createFunction(
  {
    id:      "on-dm-received",
    name:    "DM Received: qualify + draft",
    retries: 1,
  },
  { event: "dm.received" },
  async ({ event, step }) => {
    const { orgId, leadId, conversationId, messageId } =
      event.data as DmReceivedData;

    // ── 1. Load all context in a single DB round-trip ──────────
    const ctx = await step.run("load-context", async () => {
      const svc = createServiceClient();

      const [orgRes, leadRes, msgRes, voiceRes, calLinkRes] = await Promise.all([
        svc.from("orgs")
           .select("id, auto_send_replies, active_channel")
           .eq("id", orgId)
           .single(),
        svc.from("leads")
           .select("id, score, stage, channel")
           .eq("id", leadId)
           .single(),
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
        messages: (msgRes.data ?? []) as {
          direction: "inbound" | "outbound"; content: string; sent_at: string;
        }[],
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

    // ── 1b. Stop any active ghost-revival sequences for this lead ──
    await step.run("stop-revival-sequences", async () => {
      const svc = createServiceClient();
      const now = new Date().toISOString();
      await svc.from("sequence_runs").update({
        status:     "stopped",
        stopped_at: now,
        updated_at: now,
      }).eq("org_id", orgId)
        .eq("lead_id", leadId)
        .eq("type", "ghost_revival")
        .eq("status", "active");
    });

    // ── 2. Qualify ──────────────────────────────────────────────
    const qualification = await step.run("qualify-lead", async () => {
      return qualifyLead({
        messages:     ctx.messages,
        voiceProfile: ctx.voiceProfile,
        orgId,
      });
    });

    // ── 3. Persist score + stage ───────────────────────────────
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

    // ── 4 + 5. Draft + save/send (warm or hot only) ────────────
    if (qualification.stage === "hot" || qualification.stage === "warm") {
      // For hot leads: embed conversation metadata in the Cal.com link so the
      // webhook can match the booking back to this conversation.
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

        if (ctx.org?.auto_send_replies) {
          // Auto-send: insert outbound message + record draft as 'sent'
          await svc.from("messages").insert({
            conversation_id: conversationId,
            org_id:          orgId,
            direction:       "outbound",
            content:         draft.content,
            sent_at:         now,
            metadata:        { source: "ai", model: process.env.LLM_MODEL_SMART ?? "llama-3.3-70b-versatile" },
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

          // Hot leads that received an auto-sent booking reply → booking_sent
          if (qualification.stage === "hot" && calLinkForDraft) {
            await svc.from("leads").update({
              stage:      "booking_sent",
              updated_at: now,
            }).eq("id", leadId);
          }
        } else {
          // Queue for human approval
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
  }
);
