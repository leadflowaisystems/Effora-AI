/**
 * POST /api/orgs/[orgId]/bookings/simulate
 *
 * Dev-only endpoint. Returns 403 in production.
 *
 * Inserts a booking row and emits booking.created exactly as the Cal.com
 * webhook does, so on-booking-created runs identically in local dev
 * without needing a public tunnel.
 *
 * Body: { leadId, startsAt, attendeeName?, attendeeEmail? }
 * Returns: { ok, bookingId, conversationId }  — or { error, step } on failure
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { generateBookingConfirmMessage } from "@/lib/ai";
import { getLeadFirstName, formatMeetingTime } from "@/lib/leads";

interface Params { params: { orgId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 } // hide existence in prod
    );
  }

  // Track which step we're on so the catch block can report it
  let currentStep = "init";

  try {
    // ── Auth ──────────────────────────────────────────────────
    currentStep = "auth";
    console.log("[simulate/booking] step: auth");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Parse body ────────────────────────────────────────────
    currentStep = "parse_body";
    console.log("[simulate/booking] step: parse_body");
    const body = await req.json().catch(() => ({}));
    const { leadId, startsAt, attendeeName, attendeeEmail } = body as {
      leadId?:        string;
      startsAt?:      string;
      attendeeName?:  string;
      attendeeEmail?: string;
    };

    if (!leadId)   return NextResponse.json({ error: "leadId required",  step: "parse_body" }, { status: 400 });
    if (!startsAt) return NextResponse.json({ error: "startsAt required", step: "parse_body" }, { status: 400 });

    const orgId = params.orgId;
    const svc   = createServiceClient();
    const now   = new Date().toISOString();

    // ── Verify lead belongs to org ────────────────────────────
    currentStep = "fetch_lead";
    console.log(`[simulate/booking] step: fetch_lead  leadId=${leadId}  orgId=${orgId}`);
    const { data: leadRow, error: leadErr } = await svc
      .from("leads")
      .select("id, name")
      .eq("id", leadId)
      .eq("org_id", orgId)
      .single();

    if (leadErr) {
      console.error("[simulate/booking] fetch_lead error:", leadErr.message);
      return NextResponse.json({ error: leadErr.message, step: "fetch_lead" }, { status: 500 });
    }
    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found", step: "fetch_lead" }, { status: 404 });
    }
    console.log(`[simulate/booking] lead found: "${(leadRow as { id: string; name: string | null }).name}"`);

    // ── Find the most recent conversation for this lead ───────
    currentStep = "fetch_conversation";
    console.log("[simulate/booking] step: fetch_conversation");
    const { data: convRow, error: convErr } = await svc
      .from("conversations")
      .select("id")
      .eq("org_id", orgId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (convErr) {
      // Non-fatal — booking can still be created without a conversation link
      console.warn("[simulate/booking] fetch_conversation warning:", convErr.message);
    }
    const conversationId = (convRow as { id: string } | null)?.id ?? null;
    console.log(`[simulate/booking] conversationId=${conversationId ?? "none"}`);

    // ── End time = start + 30 min ─────────────────────────────
    const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60 * 1000).toISOString();

    // ── Insert the booking row ────────────────────────────────
    currentStep = "insert_booking";
    console.log(`[simulate/booking] step: insert_booking  startsAt=${startsAt}  endsAt=${endsAt}`);
    const { data: booking, error: bookingErr } = await svc
      .from("bookings")
      .insert({
        org_id:          orgId,
        lead_id:         leadId,
        conversation_id: conversationId,
        cal_booking_uid: `sim_${Date.now()}`,
        attendee_name:   attendeeName  || (leadRow as { name: string | null }).name || null,
        attendee_email:  attendeeEmail || null,
        meeting_url:     null,
        status:          "confirmed",
        starts_at:       startsAt,
        ends_at:         endsAt,
        updated_at:      now,
      })
      .select("id")
      .single();

    if (bookingErr || !booking) {
      console.error("[simulate/booking] insert_booking failed:", bookingErr?.message);
      return NextResponse.json(
        { error: bookingErr?.message ?? "Failed to create booking", step: "insert_booking" },
        { status: 500 }
      );
    }
    const bookingId = (booking as { id: string }).id;
    console.log(`[simulate/booking] booking inserted: ${bookingId}`);

    // ── Advance lead to 'booked' ──────────────────────────────
    currentStep = "update_lead_stage";
    console.log("[simulate/booking] step: update_lead_stage → booked");
    const { error: stageErr } = await svc.from("leads").update({
      stage:      "booked",
      updated_at: now,
    }).eq("id", leadId);

    if (stageErr) {
      // Non-fatal — booking is committed; just log and continue
      console.warn("[simulate/booking] update_lead_stage warning:", stageErr.message);
    }

    // ── Send booking confirmation message synchronously ──────────
    // (Dev simulate: we bypass Inngest for the confirm message so it
    //  appears immediately without needing the Inngest dev server)
    if (conversationId) {
      currentStep = "confirm_message";
      console.log("[simulate/booking] step: confirm_message  conv=", conversationId);
      try {
        const [voiceRes] = await Promise.all([
          svc.from("voice_profiles")
             .select("tone, offer")
             .eq("org_id", orgId)
             .maybeSingle(),
        ]);
        const voice = voiceRes.data as { tone: string; offer: string } | null;
        const lead  = leadRow as { id: string; name: string | null };

        const result = await generateBookingConfirmMessage({
          leadFirstName:        getLeadFirstName({ name: lead.name }),
          meetingTimeFormatted: formatMeetingTime(startsAt),
          meetingUrl:           null, // sim bookings have no URL
          voiceProfile:         voice ? { tone: voice.tone, offer: voice.offer, price_range: "", sells: "", objections: [], extra_context: "" } : null,
          orgId,
        });

        const now2 = new Date().toISOString();
        await svc.from("messages").insert({
          conversation_id: conversationId,
          org_id:          orgId,
          direction:       "outbound",
          content:         result.content,
          sent_at:         now2,
          metadata:        { source: "booking_confirm" },
        });
        await svc.from("conversations").update({
          last_message_at:      now2,
          last_message_preview: result.content.slice(0, 80),
        }).eq("id", conversationId);

        console.log(`[simulate/booking] ✓ confirm message inserted: "${result.content.slice(0, 60)}…"`);
      } catch (msgErr) {
        // Non-fatal — booking was created; log and continue
        console.error("[simulate/booking] confirm_message error (non-fatal):", msgErr);
      }
    }

    // ── Emit booking.created for reminder pipeline ───────────────
    currentStep = "inngest_send";
    console.log("[simulate/booking] step: inngest_send  event=booking.created");
    await inngest.send({
      name: "booking.created",
      data: { orgId, bookingId, leadId, conversationId, startsAt },
    });
    console.log("[simulate/booking] ✓ booking.created emitted");

    return NextResponse.json({ ok: true, bookingId, conversationId });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[simulate/booking] unhandled error at step "${currentStep}":`, err);
    return NextResponse.json({ error: msg, step: currentStep }, { status: 500 });
  }
}
