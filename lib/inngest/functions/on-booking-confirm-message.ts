/**
 * Inngest function: booking.confirm-message
 *
 * Fires immediately after a booking is created (real Cal.com webhook OR
 * dev simulate-booking). Generates a short AI confirmation message and
 * posts it to the lead's conversation thread.
 *
 * Steps:
 *   1. load-context           — fetch booking, lead, voice profile
 *   2. generate-confirm-msg   — call LLM (or template fallback) with booking details
 *   3. insert-message         — write outbound message row, update conversation preview
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { generateBookingConfirmMessage } from "@/lib/ai";
import { getLeadFirstName, formatMeetingTime } from "@/lib/leads";

interface BookingConfirmMessageData {
  orgId:     string;
  bookingId: string;
}

export const onBookingConfirmMessage = inngest.createFunction(
  {
    id:      "on-booking-confirm-message",
    name:    "Booking: send AI confirmation message",
    retries: 1,
  },
  { event: "booking.confirm-message" },
  async ({ event, step }) => {
    const { orgId, bookingId } = event.data as BookingConfirmMessageData;

    // ── 1. Load booking + lead + voice ────────────────────────────
    const ctx = await step.run("load-context", async () => {
      const svc = createServiceClient();

      const [bookingRes, voiceRes] = await Promise.all([
        svc.from("bookings")
           .select("lead_id, conversation_id, starts_at, meeting_url")
           .eq("id", bookingId)
           .single(),
        svc.from("voice_profiles")
           .select("tone, offer")
           .eq("org_id", orgId)
           .single(),
      ]);

      const booking = bookingRes.data as {
        lead_id:         string;
        conversation_id: string | null;
        starts_at:       string | null;
        meeting_url:     string | null;
      } | null;

      if (!booking) {
        console.error(`[booking-confirm] booking ${bookingId} not found`);
        return null;
      }
      if (!booking.conversation_id) {
        console.log(`[booking-confirm] booking ${bookingId} has no conversation — skipping`);
        return null;
      }

      // Fetch lead in a second call (needed for name / external_id)
      const leadRes = await svc.from("leads")
        .select("name, external_id")
        .eq("id", booking.lead_id)
        .single();

      const lead = leadRes.data as { name: string | null; external_id: string | null } | null;

      return {
        leadId:         booking.lead_id,
        conversationId: booking.conversation_id,
        startsAt:       booking.starts_at ?? new Date().toISOString(),
        meetingUrl:     booking.meeting_url,
        leadName:       lead?.name       ?? null,
        leadExternalId: lead?.external_id ?? null,
        voice:          voiceRes.data as { tone: string; offer: string } | null,
      };
    });

    if (!ctx) {
      return { skipped: true, reason: "No booking / conversation found" };
    }

    // ── 2. Generate confirmation message ──────────────────────────
    const content = await step.run("generate-confirm-msg", async () => {
      const firstName     = getLeadFirstName({ name: ctx.leadName, external_id: ctx.leadExternalId });
      const timeFormatted = formatMeetingTime(ctx.startsAt);

      const result = await generateBookingConfirmMessage({
        leadFirstName:        firstName,
        meetingTimeFormatted: timeFormatted,
        meetingUrl:           ctx.meetingUrl,
        voiceProfile:         ctx.voice
          ? {
              tone:          ctx.voice.tone,
              offer:         ctx.voice.offer,
              price_range:   "",
              sells:         "",
              objections:    [],
              extra_context: "",
            }
          : null,
        orgId,
      });

      console.log(`[booking-confirm] generated: "${result.content.slice(0, 80)}…"`);
      return result.content;
    });

    // ── 3. Insert message + update conversation preview ───────────
    await step.run("insert-message", async () => {
      const svc = createServiceClient();
      const now = new Date().toISOString();

      await svc.from("messages").insert({
        conversation_id: ctx.conversationId,
        org_id:          orgId,
        direction:       "outbound",
        content,
        sent_at:         now,
        metadata:        { source: "booking_confirm" },
      });

      await svc.from("conversations").update({
        last_message_at:      now,
        last_message_preview: content.slice(0, 80),
      }).eq("id", ctx.conversationId);

      console.log(`[booking-confirm] message inserted for conv ${ctx.conversationId}`);
    });

    return { bookingId, conversationId: ctx.conversationId, sent: true };
  },
);
