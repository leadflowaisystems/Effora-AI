/**
 * GET  /api/orgs/[orgId]/coach/goals  — list active goals
 * POST /api/orgs/[orgId]/coach/goals  — create a goal
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";
import { getAccessState } from "@/lib/access";
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

async function assertAccountability(orgId: string) {
  const access = await getAccessState(orgId);
  if (!access.canUseAccountability) {
    return NextResponse.json({ error: "Accountability Coach requires Growth plan or above." }, { status: 403 });
  }
  return null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await assertAccountability(params.orgId);
  if (gate) return gate;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data, error } = await svc
    .from("coach_goals")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goals: data ?? [] });
}

const CreateSchema = z.object({
  title:        z.string().min(1).max(300),
  target_value: z.number().optional(),
  target_date:  z.string().optional(),
  metric_type:  z.enum(["revenue","leads","calls","bookings","other"]).default("other"),
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await assertAccountability(params.orgId);
  if (gate) return gate;

  const raw    = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const { data, error } = await svc.from("coach_goals").insert({
    org_id:        params.orgId,
    title:         sanitizeText(parsed.data.title),
    target_value:  parsed.data.target_value  ?? null,
    target_date:   parsed.data.target_date   ?? null,
    metric_type:   parsed.data.metric_type,
    current_value: 0,
    status:        "active",
    created_at:    now,
    updated_at:    now,
  }).select("*").single();

  if (error) {
    console.error("[coach/goals POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ goal: data });
}
