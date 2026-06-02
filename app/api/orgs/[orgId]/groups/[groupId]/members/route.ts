/**
 * GET  /api/orgs/[orgId]/groups/[groupId]/members — list members
 * POST /api/orgs/[orgId]/groups/[groupId]/members — add member(s)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getPlanLimits, isAtLimit } from "@/lib/plan";

interface Params { params: { orgId: string; groupId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data, error } = await svc.from("lead_group_members")
    .select("lead_id, added_at, lead:lead_id(id, name, external_id, channel, stage, score, phone, instagram_handle, metadata)")
    .eq("group_id", params.groupId)
    .order("added_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}

const AddMembersSchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = AddMembersSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Verify group belongs to org
  const { data: group } = await svc.from("lead_groups").select("id, org_id").eq("id", params.groupId).eq("org_id", params.orgId).is("deleted_at", null).single();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Plan limit check — total members across all org's groups
  const { data: orgRow } = await svc.from("orgs").select("plan").eq("id", params.orgId).single();
  const plan = (orgRow as { plan: string } | null)?.plan ?? "starter";
  const limits = getPlanLimits(plan);
  if (limits.groupMembersTotal > -1) {
    const { count: totalMembers } = await svc.from("lead_group_members")
      .select("lead_id", { count: "exact", head: true })
      .in("group_id", (await svc.from("lead_groups").select("id").eq("org_id", params.orgId).is("deleted_at", null)).data?.map((g: { id: string }) => g.id) ?? []);
    if (isAtLimit((totalMembers ?? 0) + parsed.data.lead_ids.length, limits.groupMembersTotal)) {
      return NextResponse.json({ error: `Member limit reached (${limits.groupMembersTotal} total on ${plan} plan). Upgrade to add more.` }, { status: 403 });
    }
  }

  // Insert members, ignoring duplicates via ON CONFLICT DO NOTHING
  const rows = parsed.data.lead_ids.map((lid) => ({ group_id: params.groupId, lead_id: lid, added_by: user.id }));
  const { error } = await svc.from("lead_group_members").upsert(rows, { onConflict: "group_id,lead_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, added: rows.length });
}
