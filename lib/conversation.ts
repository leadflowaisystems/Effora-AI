/**
 * lib/conversation.ts — shared helpers for conversation management.
 *
 * getOrCreateConversation: ensures a lead always has a conversation row
 * so messages can be threaded to their inbox.
 */

import { createServiceClient } from "@/lib/supabase/server";

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

  // Try to find an existing conversation
  const { data: existing } = await svc
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing?.id) return (existing as { id: string }).id;

  // Create a new one
  const { data: newConv, error } = await svc
    .from("conversations")
    .insert({
      org_id:               orgId,
      lead_id:              leadId,
      channel_provider:     channelProvider,
      status:               "active",
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
 * Inserts an outbound AI message into a conversation and updates the preview.
 */
export async function insertOutboundMessage(
  conversationId: string,
  orgId:          string,
  content:        string,
  source:         string = "manual",
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const now = new Date().toISOString();

  await svc.from("messages").insert({
    conversation_id: conversationId,
    org_id:          orgId,
    direction:       "outbound",
    content,
    sent_at:         now,
    metadata:        { source },
  });

  await svc.from("conversations").update({
    last_message_at:      now,
    last_message_preview: content.slice(0, 80),
  }).eq("id", conversationId);
}
