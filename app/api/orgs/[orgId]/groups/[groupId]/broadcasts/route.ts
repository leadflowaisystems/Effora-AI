/**
 * POST /api/orgs/[orgId]/groups/[groupId]/broadcasts — create and queue a broadcast
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

const BroadcastSchema = z.object({
  channel:          z.enum(["instagram", "whatsapp", "both"]),
  message_template: z.string().min(1).max(4096),
  template_id:      z.string().optional(),
  variables:        z.record(z.string()).optional(),
  send_at:          z.string().datetime().optional(), // ISO datetime for scheduled
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = BroadcastSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Verify group
  const { data: group } = await svc.from("lead_groups").select("id, channel")
    .eq("id", params.groupId).eq("org_id", params.orgId).is("deleted_at", null).single();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Plan limit — broadcasts this month
  const { data: orgRow } = await svc.from("orgs").select("plan").eq("id", params.orgId).single();
  const plan   = (orgRow as { plan: string } | null)?.plan ?? "starter";
  const limits = getPlanLimits(plan);
  if (limits.broadcastsPerMonth > -1) {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const { count: bcastCount } = await svc.from("broadcasts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", params.orgId)
      .gte("created_at", monthStart.toISOString());
    if (isAtLimit(bcastCount ?? 0, limits.broadcastsPerMonth)) {
      return NextResponse.json({ error: `Broadcast limit reached (${limits.broadcastsPerMonth}/month on ${plan} plan). Upgrade for more.` }, { status: 403 });
    }
  }

  // Get members
  const { data: members } = await svc.from("lead_group_members")
    .select("lead_id, lead:lead_id(id, name, phone, instagram_handle, metadata)")
    .eq("group_id", params.groupId);
  const memberList = (members ?? []) as Array<{ lead_id: string; lead: { id: string; name: string | null; phone: string | null; instagram_handle: string | null; metadata: Record<string, unknown> | null } }>;

  if (memberList.length === 0) {
    return NextResponse.json({ error: "Group has no members" }, { status: 400 });
  }

  // Render messages — replace {{name}}, {{first_name}} per recipient
  function render(template: string, lead: { name: string | null }): string {
    const fullName  = lead.name ?? "there";
    const firstName = fullName.split(/\s+/)[0];
    return template.replace(/\{\{name\}\}/gi, fullName).replace(/\{\{first_name\}\}/gi, firstName);
  }

  const sendAt = parsed.data.send_at ? new Date(parsed.data.send_at) : new Date();

  // Create broadcast record
  const { data: broadcast, error: bError } = await svc.from("broadcasts").insert({
    org_id:            params.orgId,
    group_id:          params.groupId,
    channel:           parsed.data.channel,
    message_template:  parsed.data.message_template,
    template_id:       parsed.data.template_id ?? null,
    variables:         parsed.data.variables ?? null,
    status:            "queued",
    send_at:           sendAt.toISOString(),
    total_recipients:  memberList.length,
    created_by:        user.id,
  }).select().single();

  if (bError) return NextResponse.json({ error: bError.message }, { status: 500 });
  const bcast = broadcast as { id: string };

  // Create delivery records
  const deliveries = memberList.map((m) => ({
    broadcast_id:      bcast.id,
    lead_id:           m.lead_id,
    channel:           parsed.data.channel,
    rendered_message:  render(parsed.data.message_template, m.lead),
    status:            "pending",
  }));
  await svc.from("broadcast_deliveries").insert(deliveries);

  // TODO: Trigger Inngest job to process this broadcast sequentially
  // await inngest.send({ name: "broadcast/process", data: { broadcast_id: bcast.id, org_id: params.orgId } });

  return NextResponse.json({ broadcast: bcast, recipient_count: memberList.length }, { status: 201 });
}
