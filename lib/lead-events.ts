/**
 * lib/lead-events.ts
 *
 * Thin helper for writing to the lead_events append-only log.
 * Uses the service-role client so it can be called from any API route.
 * Failures are logged but never thrown — history writes must never
 * break the primary action.
 */

import { createServiceClient } from "@/lib/supabase/server";

export type LeadEventType =
  | "booking_created"
  | "booking_completed"
  | "booking_no_show"
  | "booking_archived"
  | "booking_deleted"
  | "payment_created"
  | "payment_paid"
  | "payment_archived"
  | "payment_deleted";

export interface WriteLeadEventParams {
  orgId:      string;
  leadId:     string;
  eventType:  LeadEventType;
  entityType: "booking" | "payment";
  entityId?:  string | null;   // nullable — no FK, survives hard deletes
  title:      string;
  metadata?:  Record<string, unknown>;
}

/**
 * Write a single lead event. Never throws — failures are silently logged.
 * Returns true on success, false on failure.
 */
export async function writeLeadEvent(p: WriteLeadEventParams): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;
    const { error } = await svc.from("lead_events").insert({
      org_id:      p.orgId,
      lead_id:     p.leadId,
      event_type:  p.eventType,
      entity_type: p.entityType,
      entity_id:   p.entityId ?? null,
      title:       p.title,
      metadata:    p.metadata ?? {},
    });
    if (error) {
      console.error(`[lead-events] insert failed (${p.eventType}):`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[lead-events] unexpected error (${p.eventType}):`, e);
    return false;
  }
}

/**
 * Write multiple lead events in a single insert. Never throws.
 */
export async function writeLeadEvents(events: WriteLeadEventParams[]): Promise<void> {
  if (!events.length) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;
    const rows = events.map((p) => ({
      org_id:      p.orgId,
      lead_id:     p.leadId,
      event_type:  p.eventType,
      entity_type: p.entityType,
      entity_id:   p.entityId ?? null,
      title:       p.title,
      metadata:    p.metadata ?? {},
    }));
    const { error } = await svc.from("lead_events").insert(rows);
    if (error) {
      console.error(`[lead-events] bulk insert failed:`, error.message);
    }
  } catch (e) {
    console.error(`[lead-events] unexpected bulk error:`, e);
  }
}
