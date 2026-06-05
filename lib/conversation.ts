/**
 * lib/conversation.ts — shared helpers for conversation management.
 *
 * getOrCreateConversation    — ensures a lead always has a conversation row.
 * insertOutboundMessage      — DB-only store (no channel delivery).
 * deliverOutboundMessage     — attempt channel delivery then store result.
 *                              Use this for all automation paths that need to
 *                              reach Instagram (or any future channel).
 */

import { createServiceClient } from "@/lib/supabase/server";
import { sendInstagramMessage } from "@/lib/integrations/meta-instagram";

// channel_provider values that map to Instagram
const IG_PROVIDERS = new Set(["instagram", "meta_instagram"]);

/**
 * Returns the most recent conversation for a lead, creating one if none exists.
 * Uses the service-role client so it works in API routes without user-session context.
 */
export async function getOrCreateConversation(
  orgId:           string,
  leadId:          string,
  channelProvider: string = "manual",
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const now = new Date().toISOString();

  // Try to find an existing conversation.
  // Use maybeSingle() so "no rows" returns null rather than a PGRST116 error.
  const { data: existing } = await svc
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return (existing as { id: string }).id;

  // Create a new one.
  // NOTE: do NOT include `status` here — that column was never added to the
  // conversations table schema and PostgREST will reject the insert if present.
  const { data: newConv, error } = await svc
    .from("conversations")
    .insert({
      org_id:               orgId,
      lead_id:              leadId,
      channel_provider:     channelProvider,
      last_message_at:      now,
      last_message_preview: "",
    })
    .select("id")
    .single();

  if (error || !newConv) {
    throw new Error(`Failed to create conversation: ${error?.message ?? "unknown"}`);
  }

  return (newConv as { id: string }).id;
}

/**
 * Inserts an outbound message into a conversation and updates the preview.
 * DB-only — does NOT call any channel API. Use deliverOutboundMessage() when
 * actual delivery (e.g. Instagram Graph API) is also required.
 */
export async function insertOutboundMessage(
  conversationId: string,
  orgId:          string,
  content:        string,
  source:         string = "manual",
  providerMessageId?: string | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const now = new Date().toISOString();

  await svc.from("messages").insert({
    conversation_id:     conversationId,
    org_id:              orgId,
    direction:           "outbound",
    content,
    sent_at:             now,
    provider_message_id: providerMessageId ?? null,
    metadata:            { source },
  });

  await svc.from("conversations").update({
    last_message_at:      now,
    last_message_preview: content.slice(0, 80),
  }).eq("id", conversationId);
}

/**
 * Attempts channel delivery (Instagram Graph API) then stores the message.
 * Use this for ALL automation paths that produce outbound messages.
 *
 * Failure behaviour (automation-safe):
 *   - If Graph API call fails the message is still stored with
 *     provider_message_id=null and metadata.delivery_error set.
 *   - The error is logged but NOT re-thrown — Inngest retries handle
 *     transient failures via the function-level retry setting.
 *   - Only pure-numeric external_id values are sent to the IG API
 *     (manually-created leads have no real PSID and are silently skipped).
 *
 * Returns { delivered, provider_message_id } so callers can log outcomes.
 */
export async function deliverOutboundMessage(
  conversationId: string,
  orgId:          string,
  content:        string,
  source:         string,
): Promise<{ delivered: boolean; provider_message_id: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // ── 1. Resolve channel and recipient ──────────────────────────────────────
  const { data: conv } = await svc
    .from("conversations")
    .select("channel_provider, lead_id")
    .eq("id", conversationId)
    .single();

  const channelProvider = (conv as { channel_provider?: string; lead_id?: string } | null)?.channel_provider ?? "";
  const leadId          = (conv as { channel_provider?: string; lead_id?: string } | null)?.lead_id ?? "";

  let providerMessageId: string | null = null;
  let delivered = false;
  const deliveryMeta: Record<string, string> = {};

  // ── 2. Attempt Instagram delivery ─────────────────────────────────────────
  if (IG_PROVIDERS.has(channelProvider) && leadId) {
    const { data: lead } = await svc
      .from("leads")
      .select("external_id")
      .eq("id", leadId)
      .single();

    const rawExtId  = (lead as { external_id?: string } | null)?.external_id ?? "";
    // Strip "ig_" prefix; only pure-numeric PSIDs can receive messages via Graph API
    const igUserId  = rawExtId.replace(/^ig_/, "");
    const isPsid    = /^\d+$/.test(igUserId);

    if (!isPsid) {
      console.log(`[ig-send] automation skipping delivery — external_id="${rawExtId}" is not a numeric PSID (manually-created lead) conv=${conversationId}`);
    } else {
      try {
        console.log(`[ig-send] automation delivery conv=${conversationId} recipient=${igUserId} source=${source}`);
        const result = await sendInstagramMessage(orgId, igUserId, content);
        providerMessageId = result.provider_message_id;
        delivered = true;
        console.log(`[ig-send] automation delivery ok provider_message_id=${providerMessageId}`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // Detect Meta's 24-hour customer-initiated messaging window errors.
        // Error codes: 131047 (WA), 131026 (IG), 368 (legacy IG), or plain-text "outside".
        const is24hWindow =
          reason.includes("outside") ||
          reason.includes("131047") ||
          reason.includes("131026") ||
          reason.includes("368");
        // Detect Meta OAuthException code 200: app lacks Advanced Access to
        // instagram_manage_messages OR recipient is not a tester (Development Mode).
        // This means the Meta app is not yet approved for production — only app
        // admins/developers/testers can receive messages until App Review is approved.
        const isPermissionError =
          reason.includes('"code":200') || reason.includes("\"code\": 200") ||
          reason.includes("Advanced Access") || reason.includes("instagram_manage_messages");
        if (isPermissionError) {
          deliveryMeta.delivery_error = "meta_permission_development_mode";
          console.error(`[ig-send] META PERMISSION ERROR conv=${conversationId} source=${source}: App lacks Advanced Access to instagram_manage_messages. In Development Mode, only Meta App admins/developers/testers can receive messages. Apply for App Review at https://developers.facebook.com/apps/ to get Advanced Access. error="${reason}"`);
        } else if (is24hWindow) {
          deliveryMeta.delivery_error = "outside_24h_window";
          console.warn(`[ig-send] automation delivery skipped (outside 24h window) conv=${conversationId} source=${source}`);
        } else {
          deliveryMeta.delivery_error = reason;
          console.error(`[ig-send] automation delivery failed conv=${conversationId} source=${source} reason="${reason}"`);
          if (source === "payment_link") {
            console.error(`[ig-send] PAYMENT LINK DELIVERY FAILURE — Meta rejected payment link message. conv=${conversationId} error="${reason}"`);
          }
        }
      }
    }
  }

  // ── 3. Store message (always — even on delivery failure) ──────────────────
  const now = new Date().toISOString();

  await svc.from("messages").insert({
    conversation_id:     conversationId,
    org_id:              orgId,
    direction:           "outbound",
    content,
    sent_at:             now,
    provider_message_id: providerMessageId,
    metadata:            { source, ...deliveryMeta },
  });

  await svc.from("conversations").update({
    last_message_at:      now,
    last_message_preview: content.slice(0, 80),
  }).eq("id", conversationId);

  return { delivered, provider_message_id: providerMessageId };
}
