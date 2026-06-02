/**
 * GET    /api/orgs/[orgId]/groups/[groupId] — get group detail
 * PATCH  /api/orgs/[orgId]/groups/[groupId] — update group
 * DELETE /api/orgs/[orgId]/groups/[groupId] — soft-delete
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

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
  const { data: group, error } = await svc.from("lead_groups").select("*")
    .eq("id", params.groupId).eq("org_id", params.orgId).is("deleted_at", null).single();
  if (error || !group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Fetch members with lead info
  const { data: members } = await svc.from("lead_group_members")
    .select("lead_id, added_at, leads:lead_id(id, name, external_id, channel, stage, score, phone, instagram_handle, metadata)")
    .eq("group_id", params.groupId)
    .order("added_at", { ascending: false })
    .limit(100);

  // Fetch recent broadcasts
  const { data: broadcasts } = await svc.from("broadcasts")
    .select("id, channel, message_template, status, created_at, total_recipients, sent_count, failed_count")
    .eq("group_id", params.groupId)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ group, members: members ?? [], broadcasts: broadcasts ?? [] });
}

const UpdateSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  tag:         z.string().max(50).optional(),
  channel:     z.enum(["instagram", "whatsapp", "both"]).optional(),
  description: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data, error } = await svc.from("lead_groups")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.groupId).eq("org_id", params.orgId).is("deleted_at", null)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  await svc.from("lead_groups")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.groupId).eq("org_id", params.orgId);

  return NextResponse.json({ ok: true });
}
