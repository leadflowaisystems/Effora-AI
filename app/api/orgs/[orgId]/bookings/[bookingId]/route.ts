/**
 * DELETE /api/orgs/[orgId]/bookings/[bookingId]
 *
 * Without query params:  soft-delete — sets deleted_at = NOW().
 *   Booking is hidden from the main list but remains in DB (reports + lead history).
 *
 * ?mode=hard:            hard delete — permanently removes the booking row.
 *   Booking disappears from lists, reports, and lead history.
 *   Requires confirmation on the client side before calling this.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { writeLeadEvent } from "@/lib/lead-events";

interface Params { params: { orgId: string; bookingId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc  = createServiceClient() as any;

  const allowed = ["template_active", "next_run_at", "template_name"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = (body as Record<string, unknown>)[k];
  }
  update.updated_at = new Date().toISOString();

  const { error } = await svc
    .from("bookings")
    .update(update)
    .eq("id", params.bookingId)
    .eq("org_id", params.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = req.nextUrl.searchParams.get("mode");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc  = createServiceClient() as any;

  // Fetch lead_id before deleting so we can write the event
  const { data: bk } = await svc
    .from("bookings")
    .select("lead_id")
    .eq("id", params.bookingId)
    .eq("org_id", params.orgId)
    .single();
  const leadId = (bk as { lead_id: string } | null)?.lead_id ?? null;

  if (mode === "hard") {
    // Permanent deletion — remove the row entirely.
    const { error } = await svc
      .from("bookings")
      .delete()
      .eq("id", params.bookingId)
      .eq("org_id", params.orgId);

    if (error) {
      console.error("[bookings/hard-delete]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (leadId) {
      // entity_id preserved in event even though the booking row is gone
      void writeLeadEvent({
        orgId: params.orgId, leadId,
        eventType: "booking_deleted", entityType: "booking", entityId: params.bookingId,
        title: "Booking permanently deleted",
      });
    }
  } else {
    // Soft delete — hide from list, preserve for reports + lead history.
    const { error } = await svc
      .from("bookings")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", params.bookingId)
      .eq("org_id", params.orgId);

    if (error) {
      console.error("[bookings/soft-delete]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (leadId) {
      void writeLeadEvent({
        orgId: params.orgId, leadId,
        eventType: "booking_archived", entityType: "booking", entityId: params.bookingId,
        title: "Booking removed from list",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
