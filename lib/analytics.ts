/**
 * lib/analytics.ts — lightweight internal event tracking.
 * Writes to analytics_events table in Supabase.
 * Non-blocking (fire and forget) — never throws.
 */

import { createServiceClient } from "@/lib/supabase/server";

export interface TrackEvent {
  event:       string;
  orgId?:      string | null;
  userId?:     string | null;
  properties?: Record<string, unknown>;
}

export async function track(e: TrackEvent): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;
    await svc.from("analytics_events").insert({
      event:      e.event,
      org_id:     e.orgId   ?? null,
      user_id:    e.userId  ?? null,
      properties: e.properties ?? {},
    });
  } catch {
    // Non-fatal — analytics should never break app functionality
  }
}

// ── Pre-defined event names ─────────────────────────────────────────────────
export const EVENTS = {
  // Auth
  USER_SIGNUP:            "user.signup",
  USER_LOGIN:             "user.login",
  // CRM
  LEAD_CREATED:           "lead.created",
  LEAD_STAGE_CHANGED:     "lead.stage_changed",
  // Inbox
  MESSAGE_SENT:           "message.sent",
  AI_DRAFT_APPROVED:      "ai_draft.approved",
  AI_DRAFT_REJECTED:      "ai_draft.rejected",
  // Bookings
  BOOKING_CREATED:        "booking.created",
  // Payments
  PAYMENT_REQUESTED:      "payment.requested",
  PAYMENT_RECORDED:       "payment.recorded",
  // Broadcasts
  BROADCAST_SENT:         "broadcast.sent",
  // Groups
  GROUP_CREATED:          "group.created",
  // Copilot
  COPILOT_MESSAGE:        "copilot.message",
} as const;
