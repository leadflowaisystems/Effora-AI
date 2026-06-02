/**
 * DELETE /api/orgs/[orgId]/groups/[groupId]/members/[leadId] — remove member
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string; groupId: string; leadId: string } }

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
  // Verify group belongs to org before deleting
  const { data: group } = await svc.from("lead_groups").select("id").eq("id", params.groupId).eq("org_id", params.orgId).is("deleted_at", null).single();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  await svc.from("lead_group_members").delete().eq("group_id", params.groupId).eq("lead_id", params.leadId);
  return NextResponse.json({ ok: true });
}
