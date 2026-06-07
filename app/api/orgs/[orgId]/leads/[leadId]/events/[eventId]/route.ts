/**
 * DELETE /api/orgs/[orgId]/leads/[leadId]/events/[eventId]
 * Soft-deletes a lead_events row (sets deleted_at).
 * Does NOT delete the associated booking or payment record.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string; leadId: string; eventId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const { error } = await svc
    .from("lead_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.eventId)
    .eq("lead_id", params.leadId)
    .eq("org_id", params.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
