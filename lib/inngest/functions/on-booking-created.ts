/**
 * Inngest function: booking.created
 *
 * Fires when a Cal.com webhook confirms a new booking.
 * Sends a 24h reminder then a 1h reminder via the lead's conversation.
 *
 * For local testing with short intervals, set env:
 *   TEST_REMINDER_24H_MS=10000   (10 s instead of 24 h)
 *   TEST_REMINDER_1H_MS=5000     (5 s instead of 1 h)
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { sendChannelMessage } from "@/lib/booking";
import { build24hReminder, build1hReminder } from "@/prompts/reminder";
import { sendEmail } from "@/lib/email";
import { bookingConfirmation, bookingReminder24h } from "@/lib/email-templates";

interface BookingCreatedData {
  orgId:          string;
  bookingId:      string;
  leadId:         string;
  conversationId: string | null;
  startsAt:       string;
}

export const onBookingCreated = inngest.createFunction(
  {
    id:      "on-booking-created",
    name:    "Booking Created: send reminders",
    retries: 1,
  },
  { event: "booking.created" },
  async ({ event, step }) => {
    const { orgId, bookingId, leadId, conversationId, startsAt } =
      event.data as BookingCreatedData;

    if (!conversationId) {
      return { skipped: true, reason: "No conversation linked to booking" };
    }

    // ── Load booking details + voice profile ───────────────────
    const ctx = await step.run("load-booking-context", async () => {
      const svc = createServiceClient();
      const [bookingRes, leadRes, voiceRes, orgRes] = await Promise.all([
        svc.from("bookings")
           .select("attendee_name, meeting_url, starts_at")
           .eq("id", bookingId)
           .single(),
        svc.from("leads")
           .select("name, metadata")
           .eq("id", leadId)
           .single(),
        svc.from("voice_profiles")
           .select("offer")
           .eq("org_id", orgId)
           .single(),
        svc.from("orgs").select("name").eq("id", orgId).single(),
      ]);

      const booking = bookingRes.data as {
        attendee_name: string | null;
        meeting_url:   string | null;
        starts_at:     string | null;
      } | null;
      const leadMeta = (leadRes.data as { name: string | null; metadata?: Record<string, unknown> } | null);

      return {
        attendeeName: booking?.attendee_name ?? leadMeta?.name ?? null,
        meetingUrl: booking?.meeting_url ?? null,
        startsAt:   booking?.starts_at ?? startsAt,
        offer:      (voiceRes.data as { offer: string } | null)?.offer ?? "",
        leadEmail:  (leadMeta?.metadata as Record<string, unknown> | undefined)?.email as string | undefined ?? null,
        coachName:  (orgRes.data as { name: string } | null)?.name ?? "Your Coach",
      };
    });

    // ── Send booking confirmation email ───────────────────────
    if (ctx.leadEmail) {
      await step.run("send-confirmation-email", () =>
        sendEmail({
          to:       ctx.leadEmail!,
          subject:  "Your call is confirmed! 🎉",
          html:     bookingConfirmation({
            leadName:    ctx.attendeeName ?? "there",
            meetingTime: new Date(ctx.startsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            meetingUrl:  ctx.meetingUrl ?? "",
            coachName:   ctx.coachName,
          }),
          orgId,
          template: "bookingConfirmation",
        }).catch(() => null)
      );
    }

    // ── Compute reminder target times ──────────────────────────
    const test24hMs = process.env.TEST_REMINDER_24H_MS
      ? parseInt(process.env.TEST_REMINDER_24H_MS, 10) : null;
    const test1hMs = process.env.TEST_REMINDER_1H_MS
      ? parseInt(process.env.TEST_REMINDER_1H_MS, 10) : null;

    const bookingMs   = new Date(ctx.startsAt).getTime();
    const remind24At  = test24hMs != null
      ? new Date(Date.now() + test24hMs)
      : new Date(bookingMs - 24 * 60 * 60 * 1000);
    const remind1At   = test1hMs != null
      ? new Date(Date.now() + (test24hMs ?? 0) + test1hMs)
      : new Date(bookingMs -       60 * 60 * 1000);

    // ── 24h reminder ───────────────────────────────────────────
    await step.sleepUntil("wait-for-24h-reminder", remind24At);

    await step.run("send-24h-reminder", async () => {
      // Verify booking still confirmed before sending
      const svc = createServiceClient();
      const { data } = await svc.from("bookings")
        .select("status").eq("id", bookingId).single();
      const status = (data as { status: string } | null)?.status;
      if (status !== "confirmed") return { skipped: true, status };

      const msg = build24hReminder({
        leadName:   ctx.attendeeName,
        startsAt:   ctx.startsAt,
        meetingUrl: ctx.meetingUrl,
        coachOffer: ctx.offer,
      });
      await sendChannelMessage(conversationId, orgId, msg, "reminder_24h");
      if (ctx.leadEmail) {
        await sendEmail({
          to:       ctx.leadEmail,
          subject:  "Reminder: your call is tomorrow",
          html:     bookingReminder24h({
            leadName:    ctx.attendeeName ?? "there",
            meetingTime: new Date(ctx.startsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            meetingUrl:  ctx.meetingUrl ?? "",
            coachName:   ctx.coachName,
          }),
          orgId,
          template: "bookingReminder24h",
        }).catch(() => null);
      }
      return { sent: true };
    });

    // ── 1h reminder ────────────────────────────────────────────
    await step.sleepUntil("wait-for-1h-reminder", remind1At);

    await step.run("send-1h-reminder", async () => {
      const svc = createServiceClient();
      const { data } = await svc.from("bookings")
        .select("status").eq("id", bookingId).single();
      const status = (data as { status: string } | null)?.status;
      if (status !== "confirmed") return { skipped: true, status };

      const msg = build1hReminder({
        leadName:   ctx.attendeeName,
        startsAt:   ctx.startsAt,
        meetingUrl: ctx.meetingUrl,
        coachOffer: ctx.offer,
      });
      await sendChannelMessage(conversationId, orgId, msg, "reminder_1h");
      return { sent: true };
    });

    return { bookingId, reminders: "sent" };
  }
);
