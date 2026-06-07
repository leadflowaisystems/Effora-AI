/**
 * POST /api/orgs/[orgId]/bookings/manual
 * Logs a manually-created booking. Immediately sends an AI confirmation
 * message to the lead's inbox thread + email if lead has email.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { getAccessState } from "@/lib/access";
import { generateBookingConfirmMessage, fetchDeepContext } from "@/lib/ai";
import { getOrCreateConversation, insertOutboundMessage } from "@/lib/conversation";
import { sendEmail } from "@/lib/email";
import { bookingConfirmation } from "@/lib/email-templates";
import { getLeadFirstName, formatMeetingTime } from "@/lib/leads";
import { getCalLink } from "@/lib/booking";
import { withErrorHandler } from "@/lib/api-handler";
import { track, EVENTS } from "@/lib/analytics";
import { writeLeadEvent } from "@/lib/lead-events";
import { z } from "zod";

export const maxDuration = 30;

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const Schema = z.object({
  lead_id:     z.string().uuid(),
  starts_at:      z.string().datetime(),
  meeting_url:    z.string().optional().or(z.literal("")),
  notes:          z.string().max(2000).optional(),
  custom_message: z.string().max(2000).optional(),
});

async function handler(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAccessState(params.orgId);
  if (!access.canUseManualBookingPayment) {
    return NextResponse.json({ error: "Manual booking requires Starter plan or above." }, { status: 403 });
  }

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { lead_id, starts_at, meeting_url, notes, custom_message } = parsed.data;
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // ── Load lead + voice profile + org ──────────────────────────
  const [leadRes, vpRes, orgRes] = await Promise.all([
    svc.from("leads").select("name, external_id, metadata").eq("id", lead_id).eq("org_id", params.orgId).single(),
    svc.from("voice_profiles").select("tone, offer, price_range, sells, objections, extra_context").eq("org_id", params.orgId).single(),
    svc.from("orgs").select("name").eq("id", params.orgId).single(),
  ]);

  if (!leadRes.data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const lead      = leadRes.data as { name: string | null; external_id: string | null; metadata?: Record<string, unknown> };
  const vp        = vpRes.data as Parameters<typeof generateBookingConfirmMessage>[0]["voiceProfile"];
  const orgName   = (orgRes.data as { name: string } | null)?.name ?? "Your Coach";
  const leadEmail = (lead.metadata?.email) as string | undefined ?? null;

  // ── Resolve meeting URL: form-provided > Cal.com > null ──────
  // Custom URL from form takes priority over org's Cal.com default.
  const calLink    = await getCalLink(params.orgId);
  const resolvedMeetingUrl = meeting_url?.trim() || calLink || null;

  // ── Insert booking row ────────────────────────────────────────
  const ends_at = new Date(new Date(starts_at).getTime() + 60 * 60 * 1000).toISOString();
  const { data: booking, error: bookingErr } = await svc.from("bookings").insert({
    org_id:         params.orgId,
    lead_id,
    status:         "confirmed",
    starts_at,
    ends_at,
    meeting_url:    resolvedMeetingUrl,
    attendee_name:  lead.name,
    notes:          notes || null,
    custom_message: custom_message?.trim() || null,
    source:         "manual",
    created_at:     now,
    updated_at:     now,
  }).select("id, starts_at").single();

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
  const b = booking as { id: string; starts_at: string };

  // ── Write lead event (non-fatal) ──────────────────────────────
  void writeLeadEvent({
    orgId:      params.orgId,
    leadId:     lead_id,
    eventType:  "booking_created",
    entityType: "booking",
    entityId:   b.id,
    title:      "Booking created (manual)",
    metadata:   { starts_at, meeting_url: resolvedMeetingUrl },
  });

  // ── Get or create conversation ────────────────────────────────
  const conversationId = await getOrCreateConversation(params.orgId, lead_id, "manual");

  // ── Generate + insert confirmation message ───────────────────
  const firstName      = getLeadFirstName({ name: lead.name, external_id: lead.external_id });
  const meetingTimeFmt = formatMeetingTime(starts_at);
  const deepCtx        = await fetchDeepContext(params.orgId);
  void deepCtx;

  let confirmContent: string;
  if (custom_message?.trim()) {
    // Use verbatim custom message with variable substitution
    const d = new Date(starts_at);
    const dateStr = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    confirmContent = custom_message
      .replace(/\{\{name\}\}/gi,       lead.name ?? "there")
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{date\}\}/gi,       dateStr)
      .replace(/\{\{time\}\}/gi,       timeStr)
      .replace(/\{\{link\}\}/gi,       resolvedMeetingUrl ?? "");
  } else {
    const aiResult = await generateBookingConfirmMessage({
      leadFirstName:        firstName,
      meetingTimeFormatted: meetingTimeFmt,
      meetingUrl:           resolvedMeetingUrl,
      voiceProfile:         vp,
      orgId:                params.orgId,
    }).catch(() => ({
      content: `Done ${firstName}. Your call on ${meetingTimeFmt} is confirmed.${resolvedMeetingUrl ? ` Join here: ${resolvedMeetingUrl}` : ""} Talk soon.`,
    }));
    confirmContent = aiResult.content;
  }

  await insertOutboundMessage(conversationId, params.orgId, confirmContent, "booking_confirm");

  // ── Send email if lead has email ──────────────────────────────
  if (leadEmail) {
    await sendEmail({
      to:       leadEmail,
      subject:  "Your call is confirmed!",
      html:     bookingConfirmation({
        leadName:    firstName || "there",
        meetingTime: meetingTimeFmt,
        meetingUrl:  resolvedMeetingUrl ?? "",
        coachName:   orgName,
      }),
      orgId:    params.orgId,
      leadId:   lead_id,
      template: "bookingConfirmation",
    }).catch(() => null);
  }

  // ── Fire reminder Inngest events ──────────────────────────────
  await inngest.send({
    name: "booking.created",
    data: {
      orgId:          params.orgId,
      bookingId:      b.id,
      leadId:         lead_id,
      conversationId,
      startsAt:       b.starts_at,
    },
  });

  void track({ event: EVENTS.BOOKING_CREATED, orgId: params.orgId, userId: user.id, properties: { booking_id: b.id, source: "manual" } });
  return NextResponse.json({ booking_id: b.id, conversation_id: conversationId });
}

export const POST = withErrorHandler("bookings/manual", handler);
