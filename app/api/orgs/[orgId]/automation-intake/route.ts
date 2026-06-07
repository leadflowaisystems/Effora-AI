/**
 * GET  /api/orgs/[orgId]/automation-intake  — load saved intake
 * POST /api/orgs/[orgId]/automation-intake  — upsert intake answers
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data } = await svc
    .from("automation_intake")
    .select("*")
    .eq("org_id", params.orgId)
    .maybeSingle();

  return NextResponse.json({ intake: data ?? null });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const allowed = [
    "what_you_sell", "ideal_customer", "avg_price",
    "qualifies_lead", "disqualifies_lead",
    "booking_reminder_tone", "preferred_tone",
    "payment_reminder_tone", "payment_reminder_freq",
    "common_questions", "common_objections",
    "escalation_rules", "additional_notes",
  ];

  const payload: Record<string, unknown> = { org_id: params.orgId, updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) payload[key] = (body as Record<string, unknown>)[key];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { error } = await svc
    .from("automation_intake")
    .upsert(payload, { onConflict: "org_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
