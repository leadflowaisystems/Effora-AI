/**
 * GET  /api/orgs/[orgId]/groups — list all groups for an org
 * POST /api/orgs/[orgId]/groups — create a new group
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getPlanLimits, isAtLimit } from "@/lib/plan";

interface Params { params: { orgId: string } }

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
  const { data, error } = await svc
    .from("lead_groups")
    .select(`
      id, name, tag, channel, description, created_at, updated_at,
      member_count:lead_group_members(count),
      last_broadcast:broadcasts(created_at)
    `)
    .eq("org_id", params.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten member counts
  const groups = (data ?? []).map((g: Record<string, unknown>) => ({
    ...g,
    member_count: (g.member_count as Array<{ count: number }>)?.[0]?.count ?? 0,
    last_broadcast_at: (g.last_broadcast as Array<{ created_at: string }>)?.[0]?.created_at ?? null,
    last_broadcast: undefined,
  }));

  return NextResponse.json({ groups });
}

const CreateGroupSchema = z.object({
  name:        z.string().min(1).max(100),
  tag:         z.string().max(50).optional(),
  channel:     z.enum(["instagram", "whatsapp", "both"]),
  description: z.string().max(500).optional(),
});

function autoTag(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("-")
    .slice(0, 40) || "group";
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = CreateGroupSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Plan limit check
  const { data: orgRow } = await svc.from("orgs").select("plan").eq("id", params.orgId).single();
  const plan   = (orgRow as { plan: string } | null)?.plan ?? "starter";
  const limits = getPlanLimits(plan);
  const { count: groupCount } = await svc.from("lead_groups")
    .select("id", { count: "exact", head: true })
    .eq("org_id", params.orgId).is("deleted_at", null);
  if (isAtLimit(groupCount ?? 0, limits.groupsAllowed)) {
    return NextResponse.json({ error: `Group limit reached (${limits.groupsAllowed} on ${plan} plan). Upgrade to create more.` }, { status: 403 });
  }

  const tag = parsed.data.tag?.trim() || autoTag(parsed.data.name);

  const { data, error } = await svc.from("lead_groups").insert({
    org_id:      params.orgId,
    name:        parsed.data.name.trim(),
    tag,
    channel:     parsed.data.channel,
    description: parsed.data.description ?? null,
    created_by:  user.id,
  }).select().single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: `Tag "${tag}" already used. Try a different name.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ group: data }, { status: 201 });
}
