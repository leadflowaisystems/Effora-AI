/**
 * Booking helpers for Phase 3.
 *
 * getCalLink                — fetches the Cal.com booking URL for an org.
 * embedMetadataInCalLink    — appends convId + leadId metadata params.
 * sendChannelMessage        — inserts an outbound message, updates conversation preview.
 */

import { createServiceClient } from "@/lib/supabase/server";

/** Returns the plain-text booking URL from the calcom integration, or null. */
export async function getCalLink(orgId: string): Promise<string | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("integrations")
      .select("config, active")
      .eq("org_id", orgId)
      .eq("provider", "calcom")
      .single();

    if (!data?.active) return null;
    const config = (data.config as Record<string, unknown>) ?? {};
    // Settings page saves as cal_link; legacy/API uses booking_url — check both
    const url = ((config.cal_link ?? config.booking_url) as string | undefined) ?? "";
    return url.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Appends Cal.com metadata query params so the webhook can identify
 * which conversation + lead triggered the booking.
 *
 * Cal.com passes ?metadata[key]=value through to webhook payload.metadata.
 */
export function embedMetadataInCalLink(
  calLink: string,
  conversationId: string,
  leadId: string
): string {
  try {
    const url = new URL(calLink);
    url.searchParams.set("metadata[cId]", conversationId);
    url.searchParams.set("metadata[lId]", leadId);
    return url.toString();
  } catch {
    // Invalid URL — return original unmodified
    return calLink;
  }
}

/** Inserts an outbound message and updates conversation last_message fields. */
export async function sendChannelMessage(
  conversationId: string,
  orgId: string,
  content: string,
  source: "reminder_24h" | "reminder_1h" | "rebook" | "system" = "system"
): Promise<void> {
  const svc = createServiceClient();
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
