/**
 * Inngest function: broadcast.process
 *
 * Processes a queued broadcast by iterating through its delivery rows,
 * rendering the message per recipient, and calling the correct channel API.
 *
 * Rate-limited: 1 delivery every 1.5 seconds to avoid Meta API limits.
 *
 * META COMPLIANCE:
 *   Instagram — messages only sent within the 24-hour customer-initiated window.
 *               Outside that window the Meta API will reject the call anyway.
 *   WhatsApp  — same 24-hour window rule. Outside the window, only approved
 *               templates can be sent. Free-form text is skipped with reason.
 *
 * DEV MODE (META_APP_MODE !== "live"):
 *   All deliveries are logged as "skipped — Meta approval pending" so the
 *   operator can verify the full flow without accidentally spamming.
 */

import { inngest }              from "../client";
import { createServiceClient }  from "@/lib/supabase/server";
import { sendWhatsAppMessage, sendWhatsAppTemplate }  from "@/lib/integrations/whatsapp-cloud";
import { sendInstagramMessage } from "@/lib/integrations/meta-instagram";
import { getOrCreateConversation, insertOutboundMessage } from "@/lib/conversation";

// ── Types ────────────────────────────────────────────────────────────────────

interface BroadcastRow {
  id:               string;
  org_id:           string;
  channel:          string;
  message_template: string;
  template_id:      string | null;
  status:           string;
  total_recipients: number;
}

interface DeliveryRow {
  id:               string;
  lead_id:          string;
  channel:          string;
  rendered_message: string | null;
  status:           string;
}

interface LeadRow {
  id:               string;
  name:             string | null;
  external_id:      string;
  channel:          string;
  phone:            string | null;
  instagram_handle: string | null;
  metadata:         Record<string, unknown> | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderTemplate(template: string, lead: LeadRow): string {
  const fullName  = lead.name ?? "there";
  const firstName = fullName.split(/\s+/)[0];
  return template
    .replace(/\{\{name\}\}/gi,       fullName)
    .replace(/\{\{first_name\}\}/gi, firstName);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPhone(lead: LeadRow): string | null {
  return lead.phone ?? (lead.metadata?.phone as string | null) ?? null;
}

function getIgUserId(lead: LeadRow): string | null {
  // The external_id for IG-sourced leads IS the PSID Meta gave us (e.g. "123456789")
  // Manually-added IG leads have "ig_handle_xxxx" — those cannot receive broadcasts
  // via the IG API (we don't have their PSID).
  const eid = lead.external_id;
  if (/^\d+$/.test(eid)) return eid; // pure numeric = PSID
  return null;
}

const DEV_MODE = (process.env.META_APP_MODE ?? "dev") !== "live";

// ── Inngest function ──────────────────────────────────────────────────────────

interface BroadcastQueuedData {
  broadcast_id: string;
  org_id:       string;
}

export const onBroadcastProcess = inngest.createFunction(
  {
    id:       "on-broadcast-process",
    name:     "Broadcast: process and deliver messages",
    retries:  1,
    throttle: { limit: 1, period: "5s", key: "event.data.org_id" },
  },
  { event: "broadcast.queued" },
  async ({ event, step }) => {
    const { broadcast_id, org_id } = event.data as BroadcastQueuedData;

    // ── 1. Load broadcast + deliveries ──────────────────────────────────────
    const ctx = await step.run("load-broadcast", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = createServiceClient() as any;
      const { data: broadcast } = await svc
        .from("broadcasts")
        .select("id, org_id, channel, message_template, template_id, status, total_recipients")
        .eq("id", broadcast_id)
        .eq("org_id", org_id)
        .single();

      if (!broadcast || broadcast.status !== "queued") {
        return { broadcast: null, deliveries: [] };
      }

      const { data: deliveries } = await svc
        .from("broadcast_deliveries")
        .select("id, lead_id, channel, rendered_message, status")
        .eq("broadcast_id", broadcast_id)
        .eq("status", "pending");

      // Mark broadcast as running
      await svc.from("broadcasts")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", broadcast_id);

      return { broadcast: broadcast as BroadcastRow, deliveries: (deliveries ?? []) as DeliveryRow[] };
    });

    if (!ctx.broadcast) {
      return { skipped: true, reason: "Broadcast not found or not queued" };
    }

    // ── 2. Process each delivery ─────────────────────────────────────────────
    let sentCount   = 0;
    let failedCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;

    for (const delivery of ctx.deliveries) {
      await step.run(`deliver-${delivery.id}`, async () => {
        // Load lead
        const { data: leadData } = await svc
          .from("leads")
          .select("id, name, external_id, channel, phone, instagram_handle, metadata")
          .eq("id", delivery.lead_id)
          .single();
        const lead = leadData as LeadRow | null;
        if (!lead) {
          await markDelivery(svc, delivery.id, "failed", "Lead not found");
          failedCount++;
          return;
        }

        const message = delivery.rendered_message ?? renderTemplate(ctx.broadcast!.message_template, lead);
        const channel  = delivery.channel;

        // DEV MODE: skip actual API call but still create conversation message
        // so the lead's /inbox thread shows the broadcast message.
        if (DEV_MODE) {
          await markDelivery(svc, delivery.id, "skipped", "Meta approval pending — dev mode");
          await storeMessageInConversation(svc, org_id, lead.id, message, channel);
          return;
        }

        // ── WhatsApp delivery ────────────────────────────────────────────────
        if (channel === "whatsapp") {
          const phone = getPhone(lead);
          if (!phone) {
            await markDelivery(svc, delivery.id, "skipped", "No phone number on file");
            return;
          }

          const templateId = ctx.broadcast!.template_id;

          // If a pre-approved template is associated, use it directly.
          // Template messages work both inside AND outside the 24h window.
          if (templateId) {
            try {
              // Look up the template name from the DB
              const { data: tpl } = await svc.from("whatsapp_templates")
                .select("name, variables, body")
                .eq("id", templateId)
                .single();

              if (tpl) {
                // Build component parameters from the rendered message's variable values
                // Extract {{1}}, {{2}} values by diffing the body against the rendered message
                const tplBody = (tpl as { name: string; variables: string[]; body: string });
                // Build positional parameters by extracting filled values from the rendered message
                // Simple heuristic: split rendered_message on variable-boundary tokens
                const renderedText = message;
                // Pass rendered text as a single body component for simplicity
                const components = [{
                  type: "body",
                  parameters: [{ type: "text", text: renderedText }],
                }];
                const result = await sendWhatsAppTemplate(org_id, phone, tplBody.name, "en", components);
                await markDelivery(svc, delivery.id, "sent", null, result.provider_message_id);
                await storeMessageInConversation(svc, org_id, lead.id, renderedText, channel, result.provider_message_id);
                sentCount++;
              } else {
                // Template not found — fall through to free-form
                const result = await sendWhatsAppMessage(org_id, phone, message);
                await markDelivery(svc, delivery.id, "sent", null, result.provider_message_id);
                await storeMessageInConversation(svc, org_id, lead.id, message, channel, result.provider_message_id);
                sentCount++;
              }
            } catch (err) {
              const reason = err instanceof Error ? err.message : String(err);
              await markDelivery(svc, delivery.id, "failed", `Template send failed: ${reason}`);
              failedCount++;
            }
          } else {
            // Free-form text message (only works within 24h window)
            try {
              const result = await sendWhatsAppMessage(org_id, phone, message);
              await markDelivery(svc, delivery.id, "sent", null, result.provider_message_id);
              await storeMessageInConversation(svc, org_id, lead.id, message, channel, result.provider_message_id);
              sentCount++;
            } catch (err) {
              const reason = err instanceof Error ? err.message : String(err);
              const is24hError = reason.includes("outside of the 24") || reason.includes("131047") || reason.includes("131026");
              await markDelivery(svc, delivery.id, "failed", is24hError
                ? "Outside 24-hour window — attach an approved template to broadcast outside the window"
                : reason);
              failedCount++;
            }
          }
          await sleep(1500); // Rate limit: 1 msg / 1.5s
          return;
        }

        // ── Instagram delivery ────────────────────────────────────────────────
        if (channel === "instagram") {
          const igUserId = getIgUserId(lead);
          if (!igUserId) {
            await markDelivery(svc, delivery.id, "skipped", "No Instagram PSID — lead was manually created, not sourced from IG DM");
            return;
          }
          try {
            const result = await sendInstagramMessage(org_id, igUserId, message);
            await markDelivery(svc, delivery.id, "sent", null, result.provider_message_id);
            await storeMessageInConversation(svc, org_id, lead.id, message, channel, result.provider_message_id);
            sentCount++;
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            const is24hError = reason.includes("outside") || reason.includes("24") || reason.includes("368");
            await markDelivery(svc, delivery.id, "failed", is24hError
              ? "Outside 24-hour Instagram window — recipient must initiate contact first"
              : reason);
            failedCount++;
          }
          await sleep(1500);
          return;
        }

        await markDelivery(svc, delivery.id, "skipped", `Unsupported channel: ${channel}`);
      });
    }

    // ── 3. Mark broadcast with correct terminal status ───────────────────────
    await step.run("complete-broadcast", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svcInner = createServiceClient() as any;

      // Re-count from DB for accuracy (skipped deliveries don't affect status)
      const [sentRes, failedRes] = await Promise.all([
        svcInner.from("broadcast_deliveries").select("id", { count: "exact", head: true })
          .eq("broadcast_id", broadcast_id).eq("status", "sent"),
        svcInner.from("broadcast_deliveries").select("id", { count: "exact", head: true })
          .eq("broadcast_id", broadcast_id).eq("status", "failed"),
      ]);

      const dbSent   = sentRes.count   ?? sentCount;
      const dbFailed = failedRes.count ?? failedCount;

      // completed = all sent (no failures)
      // partial   = at least one sent AND at least one failed
      // failed    = none sent (all failed or all skipped-as-failure)
      const finalStatus =
        dbSent > 0 && dbFailed === 0 ? "completed" :
        dbSent > 0 && dbFailed  > 0  ? "partial"   : "failed";

      await svcInner.from("broadcasts").update({
        status:       finalStatus,
        completed_at: new Date().toISOString(),
        sent_count:   dbSent,
        failed_count: dbFailed,
      }).eq("id", broadcast_id);
    });

    return { broadcast_id, sent: sentCount, failed: failedCount };
  },
);

// ── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markDelivery(svc: any, id: string, status: string, reason: string | null, msgId?: string) {
  await svc.from("broadcast_deliveries").update({
    status,
    failed_reason: reason ?? null,
    message_id:    msgId  ?? null,
    sent_at:       status === "sent" ? new Date().toISOString() : null,
  }).eq("id", id);
}

/**
 * Store the broadcast message as an outbound message in the lead's conversation
 * thread so it appears in /inbox alongside other 1:1 messages.
 *
 * Uses the lead's own channel (from the leads table) to pick the conversation
 * provider, NOT the broadcast's channel — this way a WhatsApp lead always gets
 * the message in their WA conversation, even if the group is "both".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function storeMessageInConversation(svc: any, orgId: string, leadId: string, content: string, broadcastChannel?: string, _msgId?: string) {
  try {
    // Look up the lead's own channel to pick the right conversation provider
    const { data: leadRow } = await svc.from("leads").select("channel").eq("id", leadId).single();
    const leadChannel = (leadRow as { channel: string } | null)?.channel ?? broadcastChannel ?? "manual";

    const provider =
      leadChannel === "whatsapp" || leadChannel === "whatsapp_cloud" ? "whatsapp_cloud" :
      leadChannel === "instagram" || leadChannel === "meta_instagram" ? "meta_instagram" :
      broadcastChannel === "whatsapp" ? "whatsapp_cloud" :
      broadcastChannel === "instagram" ? "meta_instagram" :
      "manual_crm";

    const convId = await getOrCreateConversation(orgId, leadId, provider);
    await insertOutboundMessage(convId, orgId, content, "broadcast");
  } catch (e) {
    console.warn("[broadcast] conversation store failed (non-fatal):", e);
  }
}
