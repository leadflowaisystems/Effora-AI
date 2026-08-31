/**
 * POST /api/webhooks/calcom/[orgId]
 *
 * Receives Cal.com webhook events and drives the booking lifecycle:
 *   BOOKING_CREATED   → create booking row, set lead stage=booked, emit booking.created
 *   BOOKING_NO_SHOW   → set status=no_show, emit booking.no_show
 *   BOOKING_CANCELLED → set status=cancelled
 *   BOOKING_COMPLETED / MEETING_ENDED → set status=completed
 *
 * Webhook signature (x-cal-signature-256) is ALWAYS verified, fail-closed:
 *   no webhook_secret saved for the org → 503, nothing is processed
 *   signature header absent             → 401
 *   signature mismatch                  → 401
 * Ids carried inside the payload (metadata.lId / metadata.cId) are proven to
 * belong to params.orgId before use, and every lead mutation is org-scoped.
 *
 * BOOKING_CREATED is idempotent per (org_id, cal_booking_uid): the unique index
 * from migration 039 makes the INSERT the arbiter, so a Cal.com retry cannot
 * create a second booking, advance the lead twice, or start a second reminder
 * chain. The two Inngest events carry deterministic ids so a re-delivery
 * deduplicates at Inngest rather than duplicating the customer's messages.
 *
 * Configure in Cal.com:
 *   Webhook URL: https://<your-domain>/api/webhooks/calcom/<orgId>
 *   Secret: the webhook_secret you save in Settings → Integrations
 *   Events: BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_RESCHEDULED, BOOKING_COMPLETED
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret, isEncrypted } from "@/lib/crypto";
import { inngest } from "@/lib/inngest/client";
import { writeLeadEvent } from "@/lib/lead-events";

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

/**
 * Constant-time HMAC comparison. The length guard runs first because
 * timingSafeEqual throws on a length mismatch; a digest's length is fixed and
 * public, so returning early there leaks nothing.
 */
function verifySignature(body: string, header: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  // header may be "sha256=<hex>" or just "<hex>"
  const actual = header.startsWith("sha256=") ? header.slice(7) : header;
  const received = Buffer.from(actual, "utf8");
  const computed = Buffer.from(expected, "utf8");
  if (received.length !== computed.length) return false;
  return timingSafeEqual(received, computed);
}

// ── Main handler ────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const rawBody = await req.text();

  // ── Fail-closed signature verification ──────────────────────
  // This runs before the payload is parsed and before any database mutation.
  // The previous `if (webhookSecret)` guard meant an org with no secret saved
  // skipped verification entirely, so anyone who knew the org id — they are
  // printed into the public coach funnel pages — could POST a forged
  // BOOKING_CREATED and cause real bookings, confirmation messages and
  // reminders to be sent to a customer's own customers.
  const webhookSecret = await getWebhookSecret(params.orgId);

  if (!webhookSecret) {
    // Server-side configuration gap rather than a bad request: 503 so Cal.com
    // retries once the secret is saved in Settings › Integrations, instead of
    // the delivery being accepted unverified or silently discarded.
    console.error(
      `[calcom-webhook] no webhook secret configured for org ${params.orgId} — rejecting. ` +
      `Save the Cal.com webhook secret in Settings › Integrations.`,
    );
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const sigHeader = req.headers.get("x-cal-signature-256") ?? "";

  if (!sigHeader) {
    console.warn(`[calcom-webhook] missing x-cal-signature-256 for org ${params.orgId} — rejecting`);
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
    console.warn(`[calcom-webhook] signature mismatch for org ${params.orgId} — rejecting`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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

    // Metadata embedded by Effora AI when injecting the Cal.com link.
    //
    // These arrive inside the webhook body, so they are caller-supplied even
    // now that the signature is verified: a valid signature proves the request
    // came from this org's Cal.com webhook, not that the ids inside it belong
    // to this org. Both were previously used verbatim — lId flowed into an
    // unscoped `leads` update, and cId into the booking row and on into
    // deliverOutboundMessage, which resolves a conversation by id alone. Each
    // must therefore be proven to belong to params.orgId before use.
    const cId = metaData?.cId as string | undefined;   // conversationId
    const lId = metaData?.lId as string | undefined;   // leadId

    let leadId: string | null = null;
    let conversationId: string | null = null;

    if (lId) {
      const { data: ownedLead } = await svc
        .from("leads").select("id")
        .eq("id", lId).eq("org_id", orgId).maybeSingle();

      if (!ownedLead) {
        // 404 and identical whether the id is unknown or belongs to another
        // org, so the response cannot be used to probe for foreign lead ids.
        console.warn(`[calcom-webhook] rejected embedded lead id not owned by org=${orgId}`);
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      leadId = (ownedLead as { id: string }).id;
    }

    if (cId) {
      const { data: ownedConv } = await svc
        .from("conversations").select("id")
        .eq("id", cId).eq("org_id", orgId).maybeSingle();

      if (!ownedConv) {
        console.warn(`[calcom-webhook] rejected embedded conversation id not owned by org=${orgId}`);
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      conversationId = (ownedConv as { id: string }).id;
    }

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

    // ── Duplicate delivery (migration 039) ────────────────────
    // Cal.com retries on any non-2xx, so the same BOOKING_CREATED arrives more
    // than once. uniq_bookings_org_cal_booking_uid makes the INSERT itself the
    // arbiter: exactly one delivery per (org_id, cal_booking_uid) can win, and
    // the losers surface SQLSTATE 23505. There is no separate check, so there
    // is no check-then-insert race even under concurrent delivery.
    let bookingId: string | null = (booking as { id: string } | null)?.id ?? null;
    let duplicate = false;

    if (bookingErr) {
      if (bookingErr.code === "23505") {
        duplicate = true;
        const { data: existing } = await svc
          .from("bookings").select("id")
          .eq("org_id", orgId).eq("cal_booking_uid", uid ?? "").maybeSingle();
        bookingId = (existing as { id: string } | null)?.id ?? null;
        console.log(`[calcom-webhook] duplicate delivery org=${orgId} uid=${uid ?? "none"} booking=${bookingId ?? "unknown"} — no second booking created`);
      } else {
        console.error("[calcom-webhook] Failed to insert booking:", bookingErr.message);
        return NextResponse.json({ error: bookingErr.message }, { status: 500 });
      }
    }

    // A duplicate must not re-run the database side effects: the lead was
    // already advanced and the lead event already written by the delivery that
    // won the insert. Only the Inngest emit below runs on both paths, because it
    // is idempotent by event id and is what recovers a first delivery whose
    // emit failed.
    if (!duplicate) {
      // Advance lead stage to "booked" + capture attendee email if not already
      // stored. Both statements are org-scoped: the service role bypasses RLS,
      // so org scoping has to be explicit here. leadId is already proven to
      // belong to this org above, which makes these filters defence in depth —
      // they close the write path outright rather than relying on that proof.
      const { data: existingLead } = await svc.from("leads")
        .select("metadata").eq("id", leadId).eq("org_id", orgId).maybeSingle();
      const existingMeta = (existingLead as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
      const shouldSaveEmail = attendee.email && !existingMeta.email;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadUpdate: Record<string, any> = { stage: "booked", updated_at: now };
      if (shouldSaveEmail) leadUpdate.metadata = { ...existingMeta, email: attendee.email };

      await svc.from("leads").update(leadUpdate).eq("id", leadId).eq("org_id", orgId);

      // Write lead event for booking created via Cal.com (non-fatal)
      if (bookingId && leadId) {
        void writeLeadEvent({
          orgId, leadId,
          eventType: "booking_created", entityType: "booking", entityId: bookingId,
          title: "Booking created (Cal.com)",
          metadata: { starts_at: startTime, attendee_email: attendee.email ?? null },
        });
      }
    }

    // ── Emit Inngest events — reminders pipeline + confirmation message ──────
    //
    // Both carry a deterministic id derived from the booking, so Inngest itself
    // refuses to start a second run for the same booking. That is what makes it
    // safe to run this on the duplicate path too: a retry re-sends the same two
    // ids and Inngest deduplicates them.
    //
    // Re-sending on a duplicate is not cosmetic. The unique index means a retry
    // no longer creates a second booking — so if the FIRST delivery inserted the
    // row and then failed to emit, without this the confirmation and reminders
    // would be lost permanently. Returning 500 below makes Cal.com retry, and
    // the retry lands here and completes the emit.
    let eventsScheduled = false;
    if (bookingId) {
      try {
        await inngest.send([
          {
            id:   `booking-created-${bookingId}`,
            name: "booking.created",
            data: {
              orgId,
              bookingId,
              leadId,
              conversationId,
              startsAt:       startTime ?? now,
            },
          },
          {
            id:   `booking-confirm-${bookingId}`,
            name: "booking.confirm-message",
            data: {
              orgId,
              bookingId,
            },
          },
        ]);
        eventsScheduled = true;
      } catch (e) {
        // The booking row is committed and correct. Surface a 5xx so Cal.com
        // retries: the retry hits the duplicate branch, skips every database
        // side effect, and reaches this emit again with the same event ids.
        console.error(
          `[calcom-webhook] EVENTS NOT SCHEDULED — inngest.send failed for booking=${bookingId} ` +
          `org=${orgId} duplicate=${duplicate}. The booking IS saved; the confirmation and ` +
          `reminders have not been queued and will retry on Cal.com's next delivery.`, e,
        );
        return NextResponse.json(
          { error: "Booking saved but events not scheduled", bookingId, duplicate },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, bookingId, duplicate, events_scheduled: eventsScheduled });
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

    void writeLeadEvent({
      orgId, leadId: bk.lead_id,
      eventType: "booking_no_show", entityType: "booking", entityId: bk.id,
      title: "No-show (Cal.com)",
    });

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
