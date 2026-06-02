/**
 * POST /api/orgs/[orgId]/bookings/group
 * Create bookings for all members of a group (fan-out for class sessions).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { inngest } from "@/lib/inngest/client";

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
  group_id:    z.string().uuid(),
  starts_at:   z.string().datetime(),
  meeting_url: z.string().url().optional().or(z.literal("")),
  notes:       z.string().max(1000).optional(),
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

  const rows = (members as Array<{ lead_id: string; lead: { id: string; name: string | null } }>).map((m) => ({
    org_id:       params.orgId,
    lead_id:      m.lead_id,
    status:       "confirmed",
    starts_at:    parsed.data.starts_at,
    ends_at:      endsAt,
    meeting_url:  parsed.data.meeting_url || null,
    attendee_name: m.lead.name ?? "Unknown",
    notes:        parsed.data.notes ?? `Group class: ${(group as { name: string }).name}`,
    created_at:   now,
  }));

  const { data: inserted, error } = await svc.from("bookings").insert(rows).select("id, lead_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire booking-created events for each
  const events = ((inserted ?? []) as Array<{ id: string; lead_id: string }>).map((b) => ({
    name: "booking.created" as const,
    data: { orgId: params.orgId, bookingId: b.id, leadId: b.lead_id },
  }));
  if (events.length > 0) {
    await inngest.send(events).catch(() => null); // non-fatal
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
