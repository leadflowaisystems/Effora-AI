/**
 * Inngest cron: recurring-booking-cron
 *
 * Runs every hour. Finds active recurring booking templates whose next_run_at
 * has arrived, creates a one_time booking instance for each, advances next_run_at,
 * and fires booking.created so the reminder pipeline activates.
 *
 * Idempotency: the template row is updated (next_run_at advanced) inside the
 * step that claims it. A second concurrent worker will find 0 matching rows.
 *
 * Does NOT touch WhatsApp / Instagram / delivery infrastructure.
 */

import { inngest }             from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreateConversation } from "@/lib/conversation";

// ── Helper: compute the next run date given a frequency ──────────────────────

function nextRunDate(from: Date, frequency: string): Date {
  const d = new Date(from);
  switch (frequency) {
    case "daily":   d.setDate(d.getDate() + 1);         break;
    case "weekly":  d.setDate(d.getDate() + 7);         break;
    case "monthly": d.setMonth(d.getMonth() + 1);       break;
    case "yearly":  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecurringTemplate {
  id:                   string;
  org_id:               string;
  lead_id:              string;
  template_name:        string | null;
  recurrence_frequency: string;
  next_run_at:          string;
  meeting_url:          string | null;
  duration_minutes:     number | null;
  notes:                string | null;
}

// ── Inngest function ──────────────────────────────────────────────────────────

export const onRecurringBookingCron = inngest.createFunction(
  {
    id:      "on-recurring-booking-cron",
    name:    "Recurring bookings: generate due instances",
    retries: 1,
  },
  { cron: "0 * * * *" }, // every hour on the hour
  async ({ step }) => {
    // ── 1. Find due templates ──────────────────────────────────────────────
    const templates = await step.run("find-due-templates", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = createServiceClient() as any;
      const { data } = await svc
        .from("bookings")
        .select("id, org_id, lead_id, template_name, recurrence_frequency, next_run_at, meeting_url, duration_minutes, notes")
        .eq("booking_type", "recurring")
        .eq("template_active", true)
        .is("deleted_at", null)
        .lte("next_run_at", new Date().toISOString())
        .limit(50);
      return (data ?? []) as RecurringTemplate[];
    });

    if (templates.length === 0) return { processed: 0 };

    let processed = 0;
    let errors    = 0;

    for (const tpl of templates) {
      await step.run(`process-template-${tpl.id}`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svc = createServiceClient() as any;
        const now = new Date();

        // ── Atomic claim: advance next_run_at ────────────────────────────────
        const next = nextRunDate(new Date(tpl.next_run_at), tpl.recurrence_frequency);
        const { data: claimed } = await svc
          .from("bookings")
          .update({ last_run_at: now.toISOString(), next_run_at: next.toISOString(), updated_at: now.toISOString() })
          .eq("id", tpl.id)
          .eq("booking_type", "recurring")
          .eq("template_active", true)
          .lte("next_run_at", now.toISOString())
          .select("id");

        if (!claimed || claimed.length === 0) {
          console.log(`[recurring-booking] template ${tpl.id} already claimed, skipping`);
          return;
        }

        try {
          // ── Load lead ────────────────────────────────────────────────────
          const { data: leadData } = await svc
            .from("leads")
            .select("id, name, channel")
            .eq("id", tpl.lead_id)
            .single();

          const lead = leadData as { id: string; name: string | null; channel: string } | null;
          if (!lead) {
            console.error(`[recurring-booking] lead not found for template ${tpl.id}`);
            errors++;
            return;
          }

          // The booking starts at next_run_at (now already advanced), so use the
          // value we just advanced to as the instance's starts_at.
          const startsAt = tpl.next_run_at; // original before advance

          // ── Get/create conversation ──────────────────────────────────────
          const lc = lead.channel?.toLowerCase() ?? "manual";
          const convProvider =
            lc === "whatsapp" || lc === "whatsapp_cloud" ? "whatsapp_cloud" :
            lc === "instagram" ? "meta_instagram" : "manual_crm";
          const conversationId = await getOrCreateConversation(tpl.org_id, tpl.lead_id, convProvider);

          // ── Create one_time booking instance ─────────────────────────────
          const { data: instance, error: insErr } = await svc.from("bookings").insert({
            org_id:              tpl.org_id,
            lead_id:             tpl.lead_id,
            attendee_name:       lead.name,
            status:              "confirmed",
            starts_at:           startsAt,
            meeting_url:         tpl.meeting_url,
            duration_minutes:    tpl.duration_minutes,
            notes:               tpl.notes ?? tpl.template_name,
            conversation_id:     conversationId,
            booking_type:        "one_time",
            template_booking_id: tpl.id,
            source:              "recurring",
            created_at:          now.toISOString(),
            updated_at:          now.toISOString(),
          }).select("id").single();

          if (insErr || !instance) {
            console.error(`[recurring-booking] failed to create instance for ${tpl.id}:`, insErr?.message);
            errors++;
            return;
          }

          const instanceId = (instance as { id: string }).id;

          // ── Fire booking.created so reminder pipeline activates ──────────
          await inngest.send({
            name: "booking.created",
            data: {
              orgId:          tpl.org_id,
              bookingId:      instanceId,
              leadId:         tpl.lead_id,
              conversationId,
              startsAt,
            },
          });

          console.log(`[recurring-booking] created instance ${instanceId} for template ${tpl.id}`);
          processed++;
        } catch (err) {
          console.error(`[recurring-booking] unexpected error for template ${tpl.id}:`, err);
          errors++;
        }
      });
    }

    return { processed, errors, total: templates.length };
  },
);
