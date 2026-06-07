/**
 * POST /api/orgs/[orgId]/bookings/group
 * Create bookings for all members of a group (fan-out for class sessions).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { inngest } from "@/lib/inngest/client";
import { getOrCreateConversation, deliverOutboundMessage } from "@/lib/conversation";
import { getCalLink } from "@/lib/booking";

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
  group_id:       z.string().uuid(),
  starts_at:      z.string().datetime(),
  meeting_url:    z.string().url().optional().or(z.literal("")),
  notes:          z.string().max(1000).optional(),
  custom_message: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Verify group
  const { data: group } = await svc.from("lead_groups").select("id, name")
    .eq("id", parsed.data.group_id).eq("org_id", params.orgId).is("deleted_at", null).single();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Get members
  const { data: members } = await svc.from("lead_group_members")
    .select("lead_id, lead:lead_id(id, name)")
    .eq("group_id", parsed.data.group_id);
  if (!members?.length) return NextResponse.json({ error: "Group has no members" }, { status: 400 });

  const now     = new Date().toISOString();
  const endsAt  = new Date(new Date(parsed.data.starts_at).getTime() + 60 * 60 * 1000).toISOString(); // +1h default

  // Fetch the org's Cal.com booking link once — used as fallback when no meeting_url is supplied.
  // This makes the UI placeholder "Leave blank to use Cal.com link" actually true.
  let orgCalLink: string | null = null;
  try {
    orgCalLink = await getCalLink(params.orgId);
    console.log(`[bookings/group] DIAG orgCalLink="${orgCalLink}" meeting_url_from_body="${parsed.data.meeting_url ?? "(none)"}"`);
  } catch (calErr) {
    console.error("[bookings/group] DIAG getCalLink threw:", calErr);
  }

  const rows = (members as Array<{ lead_id: string; lead: { id: string; name: string | null } }>).map((m) => ({
    org_id:         params.orgId,
    lead_id:        m.lead_id,
    status:         "confirmed",
    starts_at:      parsed.data.starts_at,
    ends_at:        endsAt,
    meeting_url:    parsed.data.meeting_url || null,
    attendee_name:  m.lead.name ?? "Unknown",
    notes:          parsed.data.notes ?? `Group class: ${(group as { name: string }).name}`,
    custom_message: parsed.data.custom_message?.trim() || null,
    created_at:     now,
  }));

  const { data: inserted, error } = await svc.from("bookings").insert(rows).select("id, lead_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const insertedList = (inserted ?? []) as Array<{ id: string; lead_id: string }>;

  // 1. Write booking confirmation to each member's inbox conversation thread NOW
  //    so /inbox shows it immediately (don't rely on Inngest timing).
  const dateStr = new Date(parsed.data.starts_at).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
  const timeStr = new Date(parsed.data.starts_at).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit",
  });
  const groupName = (group as { name: string }).name;

  // Build member-lead map for personalization
  const memberMap = new Map<string, string>(
    (members as Array<{ lead_id: string; lead: { id: string; name: string | null } }>)
      .map((m) => [m.lead_id, m.lead.name ?? "there"])
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcForConv = createServiceClient() as any;

  const bookingConvMap = new Map<string, string>(); // bookingId → convId

  await Promise.allSettled(insertedList.map(async (b) => {
    console.log(`[bookings/group] DIAG START lead_id=${b.lead_id} booking_id=${b.id}`);
    try {
      const fullName  = memberMap.get(b.lead_id) ?? "there";
      const firstName = fullName.split(/\s+/)[0];
      let msg: string;
      let linkUsed: string | null = null;

      if (parsed.data.custom_message?.trim()) {
        const linkForCustom = parsed.data.meeting_url?.trim() || orgCalLink || "";
        linkUsed = linkForCustom || null;
        msg = parsed.data.custom_message
          .replace(/\{\{name\}\}/gi,       fullName)
          .replace(/\{\{first_name\}\}/gi, firstName)
          .replace(/\{\{date\}\}/gi,       dateStr)
          .replace(/\{\{time\}\}/gi,       timeStr)
          .replace(/\{\{link\}\}/gi,       linkForCustom);
        console.log(`[bookings/group] DIAG lead=${b.lead_id} path=custom_message link_used="${linkUsed}"`);
      } else {
        // Use explicitly-provided meeting_url, falling back to the org's Cal.com booking link.
        const linkForMsg = parsed.data.meeting_url?.trim() || orgCalLink || null;
        linkUsed = linkForMsg;
        msg = [
          `Hi ${firstName}! Your class booking is confirmed.`,
          `📅 ${groupName} — ${dateStr} at ${timeStr}`,
          linkForMsg ? `🔗 Join here: ${linkForMsg}` : "",
          `See you there! 🙌`,
        ].filter(Boolean).join("\n");
        console.log(`[bookings/group] DIAG lead=${b.lead_id} path=default_template meeting_url="${parsed.data.meeting_url ?? "(none)"}" orgCalLink="${orgCalLink ?? "(none)"}" link_used="${linkUsed ?? "(none)"}"`);
      }

      console.log(`[bookings/group] DIAG lead=${b.lead_id} msg_first80="${msg.slice(0, 80).replace(/\n/g, "\\n")}"`);

      const { data: leadRow, error: leadErr } = await svcForConv.from("leads").select("channel").eq("id", b.lead_id).single();
      const leadChannel = (leadRow as { channel: string } | null)?.channel ?? "manual";
      console.log(`[bookings/group] DIAG lead=${b.lead_id} leadRow_channel="${leadChannel}" leadErr=${leadErr?.message ?? "none"}`);

      const provider =
        leadChannel === "whatsapp" || leadChannel === "whatsapp_cloud" ? "whatsapp_cloud" :
        leadChannel === "instagram" ? "meta_instagram" : "manual_crm";

      console.log(`[bookings/group] DIAG lead=${b.lead_id} provider="${provider}"`);

      const convId = await getOrCreateConversation(params.orgId, b.lead_id, provider);
      console.log(`[bookings/group] DIAG lead=${b.lead_id} conv_id="${convId}"`);

      // deliverOutboundMessage sends to real WA/IG channel AND stores to DB
      const deliverResult = await deliverOutboundMessage(convId, params.orgId, msg, "group_booking");
      bookingConvMap.set(b.id, convId);
      console.log(`[bookings/group] DIAG lead=${b.lead_id} delivered=${deliverResult.delivered} provider_msg_id="${deliverResult.provider_message_id ?? "null"}"`);
    } catch (e) {
      console.error(`[bookings/group] DIAG EXCEPTION lead=${b.lead_id} error="${e instanceof Error ? e.message : String(e)}" stack="${e instanceof Error ? e.stack?.split("\n")[1]?.trim() : ""}"`);
    }
    console.log(`[bookings/group] DIAG END lead_id=${b.lead_id}`);
  }));

  // 2. Also fire booking-created Inngest events (for 24h/1h reminders + email).
  //    conversationId is required by on-booking-created for reminder delivery.
  const events = insertedList.map((b) => ({
    name: "booking.created" as const,
    data: {
      orgId:          params.orgId,
      bookingId:      b.id,
      leadId:         b.lead_id,
      conversationId: bookingConvMap.get(b.id) ?? null,
      startsAt:       parsed.data.starts_at,
    },
  }));
  if (events.length > 0) {
    await inngest.send(events).catch(() => null); // non-fatal
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
