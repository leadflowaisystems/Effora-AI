/**
 * POST /api/webhooks/calcom/[orgId]
 *
 * Receives Cal.com webhook events and drives the booking lifecycle:
 *   BOOKING_CREATED   → create booking row, set lead stage=booked, emit booking.created
 *   BOOKING_NO_SHOW   → set status=no_show, emit booking.no_show
 *   BOOKING_CANCELLED → set status=cancelled
 *   BOOKING_COMPLETED / MEETING_ENDED → set status=completed
 *
 * Webhook signature (x-cal-signature-256) is verified when webhook_secret
 * is configured in the org's calcom integration.
 *
 * Configure in Cal.com:
 *   Webhook URL: https://<your-domain>/api/webhooks/calcom/<orgId>
 *   Secret: the webhook_secret you save in Settings → Integrations
 *   Events: BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_RESCHEDULED, BOOKING_COMPLETED
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret, isEncrypted } from "@/lib/crypto";
import { inngest } from "@/lib/inngest/client";

interface Params { params: { orgId: string } }

// ── Signature verification ──────────────────────────────────
async function getWebhookSecret(orgId: string): Promise<string | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("integrations")
      .select("config, active")
      .eq("org_id", orgId)
      .eq("provider", "calcom")
      .single();

    if (!data) return null;
    const config = (data.config as Record<string, unknown>) ?? {};
    const enc = config.webhook_secret_enc as string | undefined;
    if (enc && isEncrypted(enc)) {
      try { return decryptSecret(enc); } catch { /* fall through */ }
    }
    return (config.webhook_secret as string | undefined) ?? null;
  } catch {
    return null;
  }
}

function verifySignature(body: string, header: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  // header may be "sha256=<hex>" or just "<hex>"
  const actual = header.startsWith("sha256=") ? header.slice(7) : header;
  return actual === expected;
}

// ── Main handler ────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const rawBody = await req.text();

  // Verify signature if secret configured
  const webhookSecret = await getWebhookSecret(params.orgId);
  if (webhookSecret) {
    const sigHeader = req.headers.get("x-cal-signature-256") ?? "";
    if (!sigHeader || !verifySignature(rawBody, sigHeader, webhookSecret)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const triggerEvent = payload.triggerEvent as string | undefined;
  // Cal.com wraps data in payload.payload or sends it flat
  const data = (payload.payload ?? payload) as Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const orgId = params.orgId;

  // ── BOOKING_CREATED ─────────────────────────────────────────
  if (triggerEvent === "BOOKING_CREATED") {
    const uid       = data.uid as string | undefined;
    const startTime = data.startTime as string | undefined;
    const endTime   = data.endTime   as string | undefined;
    const attendees = (data.attendees as Array<{ name?: string; email?: string }>) ?? [];
    const attendee  = attendees[0] ?? {};

    // Meeting URL — Cal.com puts it in different places depending on integration
    const videoData = data.videoCallData as Record<string, unknown> | undefined;
    const metaData  = data.metadata    as Record<string, unknown> | undefined;
    const meetingUrl =
      (videoData?.url     as string | undefined) ??
      (metaData?.videoCallUrl as string | undefined) ??
      null;

    // Metadata embedded by Effora AI when injecting the Cal.com link
    const cId = metaData?.cId as string | undefined;   // conversationId
    const lId = metaData?.lId as string | undefined;   // leadId

    let leadId: string | null = lId ?? null;
    let conversationId: string | null = cId ?? null;

    // If no embedded metadata, fall back to matching by email / name
    if (!leadId) {
      if (attendee.email) {
        const { data: rows } = await svc
          .from("leads")
          .select("id")
          .eq("org_id", orgId)
          .eq("external_id", attendee.email)
          .limit(1);
        if (rows?.[0]) leadId = rows[0].id;
      }

      if (!leadId && attendee.name) {
        const { data: rows } = await svc
          .from("leads")
          .select("id")
          .eq("org_id", orgId)
          .ilike("name", `%${attendee.name}%`)
          .limit(1);
        if (rows?.[0]) leadId = rows[0].id;
      }

      // Last resort: most recent booking_sent / hot lead for this org
      if (!leadId) {
        const { data: rows } = await svc
          .from("leads")
          .select("id")
          .eq("org_id", orgId)
          .in("stage", ["booking_sent", "hot"])
          .order("updated_at", { ascending: false })
          .limit(1);
        if (rows?.[0]) leadId = rows[0].id;
      }

      // Still nothing — create a stub lead
      if (!leadId) {
        const { data: newLead } = await svc.from("leads").insert({
          org_id:      orgId,
          name:        attendee.name ?? "Cal.com attendee",
          channel:     "calcom",
          external_id: uid ?? crypto.randomUUID(),
          stage:       "booked",
          score:       85,
        }).select("id").single();
        leadId = newLead?.id ?? null;
      }
    }

    if (!leadId) {
      console.error("[calcom-webhook] Could not resolve lead for booking", uid);
      return NextResponse.json({ error: "Could not resolve lead" }, { status: 500 });
    }

    // If we found the lead but don't have a conversation from metadata, find it
    if (!conversationId) {
      const { data: convRow } = await svc
        .from("conversations")
        .select("id")
        .eq("org_id", orgId)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      conversationId = convRow?.id ?? null;
    }

    // Create booking row
    const now = new Date().toISOString();
    const { data: booking, error: bookingErr } = await svc.from("bookings").insert({
      org_id:          orgId,
      lead_id:         leadId,
      conversation_id: conversationId,
      cal_booking_uid: uid ?? null,
      attendee_name:   attendee.name  ?? null,
      attendee_email:  attendee.email ?? null,
      meeting_url:     meetingUrl,
      status:          "confirmed",
      starts_at:       startTime ?? null,
      ends_at:         endTime   ?? null,
      updated_at:      now,
    }).select("id").single();

    if (bookingErr) {
      console.error("[calcom-webhook] Failed to insert booking:", bookingErr.message);
      return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    }

    // Advance lead stage to "booked" + capture attendee email if not already stored
    const { data: existingLead } = await svc.from("leads").select("metadata").eq("id", leadId).single();
    const existingMeta = (existingLead as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const shouldSaveEmail = attendee.email && !existingMeta.email;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadUpdate: Record<string, any> = { stage: "booked", updated_at: now };
    if (shouldSaveEmail) leadUpdate.metadata = { ...existingMeta, email: attendee.email };

    await svc.from("leads").update(leadUpdate).eq("id", leadId);

    // Emit Inngest events — reminders pipeline + immediate confirmation message
    if (booking?.id) {
      await inngest.send([
        {
          name: "booking.created",
          data: {
            orgId,
            bookingId:      booking.id,
            leadId,
            conversationId,
            startsAt:       startTime ?? now,
          },
        },
        {
          name: "booking.confirm-message",
          data: {
            orgId,
            bookingId: booking.id,
          },
        },
      ]);
    }

    return NextResponse.json({ ok: true, bookingId: booking?.id });
  }

  // ── BOOKING_NO_SHOW ─────────────────────────────────────────
  if (triggerEvent === "BOOKING_NO_SHOW") {
    const uid = data.uid as string | undefined;
    const { data: booking } = await svc
      .from("bookings")
      .select("id, lead_id, conversation_id")
      .eq("org_id", orgId)
      .eq("cal_booking_uid", uid ?? "")
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    await svc.from("bookings").update({
      status:     "no_show",
      updated_at: now,
    }).eq("id", booking.id);

    const bk = booking as {
      id: string; lead_id: string; conversation_id: string | null;
    };

    await inngest.send({
      name: "booking.no_show",
      data: {
        orgId,
        bookingId:      bk.id,
        leadId:         bk.lead_id,
        conversationId: bk.conversation_id,
      },
    });

    return NextResponse.json({ ok: true });
  }

  // ── BOOKING_CANCELLED ───────────────────────────────────────
  if (triggerEvent === "BOOKING_CANCELLED") {
    const uid = data.uid as string | undefined;
    await svc.from("bookings").update({
      status:     "cancelled",
      updated_at: new Date().toISOString(),
    }).eq("org_id", orgId).eq("cal_booking_uid", uid ?? "");
    return NextResponse.json({ ok: true });
  }

  // ── BOOKING_COMPLETED / MEETING_ENDED ───────────────────────
  if (
    triggerEvent === "BOOKING_COMPLETED" ||
    triggerEvent === "MEETING_ENDED"     ||
    triggerEvent === "BOOKING_RESCHEDULED"
  ) {
    const uid = data.uid as string | undefined;
    const newStatus = triggerEvent === "BOOKING_RESCHEDULED" ? "cancelled" : "completed";
    await svc.from("bookings").update({
      status:     newStatus,
      updated_at: new Date().toISOString(),
    }).eq("org_id", orgId).eq("cal_booking_uid", uid ?? "");
    return NextResponse.json({ ok: true });
  }

  // Unknown trigger — acknowledge gracefully
  return NextResponse.json({ ok: true, event: triggerEvent });
}
