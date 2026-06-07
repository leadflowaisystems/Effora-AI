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

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = req.nextUrl.searchParams.get("mode");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc  = createServiceClient() as any;

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
  }

  return NextResponse.json({ ok: true });
}
