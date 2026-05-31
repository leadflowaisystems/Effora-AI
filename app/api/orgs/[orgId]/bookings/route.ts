/**
 * GET  /api/orgs/[orgId]/bookings  — list bookings with lead info
 * POST /api/orgs/[orgId]/bookings  — manually mark a booking as no-show
 *                                    (fires booking.no_show Inngest event)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();
  return data ? user : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cursor = req.nextUrl.searchParams.get("cursor");
  const limit  = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 100);

  const svc = createServiceClient();
  let query = svc
    .from("bookings")
    .select(`
      id, status, starts_at, ends_at, meeting_url,
      attendee_name, attendee_email, cal_booking_uid,
      conversation_id, recovery_attempt, recovery_sent_at,
      created_at, updated_at,
      lead:leads(id, name, avatar_url, stage, channel)
    `)
    .eq("org_id", params.orgId)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("starts_at", cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows       = (data ?? []);
  const hasMore    = rows.length > limit;
  const items      = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.starts_at ?? null : null;

  return NextResponse.json({ bookings: items, next_cursor: nextCursor });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { bookingId, action } = body as { bookingId?: string; action?: string };

  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  if (action !== "no_show") return NextResponse.json({ error: "action must be 'no_show'" }, { status: 400 });

  const svc = createServiceClient();
  const { data: booking, error } = await svc
    .from("bookings")
    .select("id, lead_id, conversation_id, status")
    .eq("id", bookingId)
    .eq("org_id", params.orgId)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const bk = booking as {
    id: string; lead_id: string; conversation_id: string | null; status: string;
  };

  const now = new Date().toISOString();
  await svc.from("bookings").update({
    status: "no_show", updated_at: now,
  }).eq("id", bookingId);

  await inngest.send({
    name: "booking.no_show",
    data: {
      orgId:          params.orgId,
      bookingId:      bk.id,
      leadId:         bk.lead_id,
      conversationId: bk.conversation_id,
    },
  });

  return NextResponse.json({ ok: true });
}
