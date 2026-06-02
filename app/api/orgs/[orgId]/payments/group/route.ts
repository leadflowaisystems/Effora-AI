/**
 * POST /api/orgs/[orgId]/payments/group
 * Create payment records for all members of a group (fan-out).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const Schema = z.object({
  group_id:       z.string().uuid(),
  amount_inr:     z.number().positive(),
  payment_method: z.enum(["upi", "bank_transfer", "cash", "other"]).default("upi"),
  received_at:    z.string().datetime().optional(),
  description:    z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Verify group belongs to org
  const { data: group } = await svc.from("lead_groups").select("id, name")
    .eq("id", parsed.data.group_id).eq("org_id", params.orgId).is("deleted_at", null).single();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Get all group members
  const { data: members } = await svc.from("lead_group_members").select("lead_id")
    .eq("group_id", parsed.data.group_id);
  if (!members?.length) return NextResponse.json({ error: "Group has no members" }, { status: 400 });

  const now = new Date().toISOString();
  const rows = (members as Array<{ lead_id: string }>).map((m) => ({
    org_id:         params.orgId,
    lead_id:        m.lead_id,
    amount_inr:     parsed.data.amount_inr,
    status:         "paid",
    payment_method: parsed.data.payment_method,
    received_at:    parsed.data.received_at ?? now,
    description:    parsed.data.description ?? null,
    notes:          `Group payment: ${(group as { name: string }).name}`,
    created_at:     now,
    updated_at:     now,
  }));

  const { error } = await svc.from("payments").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: rows.length });
}
