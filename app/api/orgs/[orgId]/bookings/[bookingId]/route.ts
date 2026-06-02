/**
 * DELETE /api/orgs/[orgId]/bookings/[bookingId]
 * Soft-deletes a booking by setting deleted_at = NOW().
 * The GET /api/orgs/[orgId]/bookings list query filters .is("deleted_at", null).
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

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any)
    .from("bookings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.bookingId)
    .eq("org_id", params.orgId);

  if (error) {
    console.error("[bookings/delete]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
