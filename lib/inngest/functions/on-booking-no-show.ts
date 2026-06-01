/**
 * Inngest function: booking.no_show
 *
 * Fires when a booking is marked no-show (Cal.com webhook or manual).
 * Sends a re-book offer via the lead's conversation.
 * Retries up to 2 times, 24h apart.
 * After 2 failed attempts with no new booking, marks lead as churned.
 *
 * For local testing:
 *   TEST_REBOOK_DELAY_MS=8000   (8 s instead of 24 h)
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { getCalLink, sendChannelMessage } from "@/lib/booking";
import { buildRebookOffer } from "@/prompts/rebook";

interface BookingNoShowData {
  orgId:          string;
  bookingId:      string;
  leadId:         string;
  conversationId: string | null;
}

export const onBookingNoShow = inngest.createFunction(
  {
    id:      "on-booking-no-show",
    name:    "Booking No-Show: re-book recovery",
    retries: 1,
  },
  { event: "booking.no_show" },
  async ({ event, step }) => {
    const { orgId, bookingId, leadId, conversationId } =
      event.data as BookingNoShowData;

    if (!conversationId) {
      return { skipped: true, reason: "No conversation linked" };
    }

    // ── Load context ───────────────────────────────────────────
    const ctx = await step.run("load-recovery-context", async () => {
      const svc = createServiceClient();
      const [leadRes, voiceRes] = await Promise.all([
        svc.from("leads").select("name").eq("id", leadId).single(),
        svc.from("voice_profiles").select("offer").eq("org_id", orgId).single(),
      ]);
      const calLink = await getCalLink(orgId);
      return {
        leadName: (leadRes.data as { name: string | null } | null)?.name ?? null,
        offer:    (voiceRes.data as { offer: string } | null)?.offer ?? "",
        calLink,
      };
    });

    const rebookDelayMs = process.env.TEST_REBOOK_DELAY_MS
      ? parseInt(process.env.TEST_REBOOK_DELAY_MS, 10)
      : 24 * 60 * 60 * 1000;

    // ── Attempt 1 ──────────────────────────────────────────────
    await step.run("send-rebook-attempt-1", async () => {
      const msg = buildRebookOffer({
        leadName:   ctx.leadName,
        attempt:    1,
        calLink:    ctx.calLink,
        coachOffer: ctx.offer,
      });
      await sendChannelMessage(conversationId, orgId, msg, "rebook");

      const svc = createServiceClient();
      const now = new Date().toISOString();
      await svc.from("bookings").update({
        recovery_attempt: 1,
        recovery_sent_at: now,
        updated_at:       now,
      }).eq("id", bookingId);
    });

    // Wait before second attempt
    await step.sleep("wait-before-attempt-2", rebookDelayMs);

    // Check if they've booked in the meantime
    const rebooked1 = await step.run("check-rebooked-after-1", async () => {
      const svc = createServiceClient();
      const { data } = await svc
        .from("bookings")
        .select("id")
        .eq("lead_id", leadId)
        .neq("id", bookingId)
        .in("status", ["confirmed", "completed"])
        .limit(1);
      return (data?.length ?? 0) > 0;
    });

    if (rebooked1) {
      console.log(`[no-show] lead ${leadId} rebooked after attempt 1`);
      return { leadId, rebookAttempts: 1, outcome: "rebooked" };
    }

    // ── Attempt 2 (final) ──────────────────────────────────────
    await step.run("send-rebook-attempt-2", async () => {
      const msg = buildRebookOffer({
        leadName:   ctx.leadName,
        attempt:    2,
        calLink:    ctx.calLink,
        coachOffer: ctx.offer,
      });
      await sendChannelMessage(conversationId, orgId, msg, "rebook");

      const svc = createServiceClient();
      const now = new Date().toISOString();
      await svc.from("bookings").update({
        recovery_attempt: 2,
        recovery_sent_at: now,
        updated_at:       now,
      }).eq("id", bookingId);
    });

    // Wait after second attempt then churn if still no booking
    await step.sleep("wait-before-churn-check", rebookDelayMs);

    const rebooked2 = await step.run("check-rebooked-after-2", async () => {
      const svc = createServiceClient();
      const { data } = await svc
        .from("bookings")
        .select("id")
        .eq("lead_id", leadId)
        .neq("id", bookingId)
        .in("status", ["confirmed", "completed"])
        .limit(1);
      return (data?.length ?? 0) > 0;
    });

    if (rebooked2) {
      console.log(`[no-show] lead ${leadId} rebooked after attempt 2`);
      return { leadId, rebookAttempts: 2, outcome: "rebooked" };
    }

    // Still no booking — mark churned
    await step.run("mark-churned", async () => {
      const svc = createServiceClient();
      await svc.from("leads").update({
        stage:      "churned",
        updated_at: new Date().toISOString(),
      }).eq("id", leadId);
    });

    console.log(`[no-show] lead ${leadId} marked churned after 2 recovery attempts`);
    return { leadId, rebookAttempts: 2, outcome: "churned" };
  }
);
