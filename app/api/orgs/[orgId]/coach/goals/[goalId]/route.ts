/**
 * PATCH /api/orgs/[orgId]/coach/goals/[goalId] — update status / fields
 * DELETE /api/orgs/[orgId]/coach/goals/[goalId] — hard delete
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";
import { z } from "zod";

interface Params { params: { orgId: string; goalId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const PatchSchema = z.object({
  title:        z.string().min(1).max(300).optional(),
  metric_type:  z.enum(["revenue","leads","calls","bookings","other"]).optional(),
  target_value: z.number().nullable().optional(),
  target_date:  z.string().nullable().optional(),
  status:       z.enum(["active","completed","archived"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const now     = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  if (parsed.data.title        !== undefined) updates.title        = sanitizeText(parsed.data.title);
  if (parsed.data.metric_type  !== undefined) updates.metric_type  = parsed.data.metric_type;
  if (parsed.data.target_value !== undefined) updates.target_value = parsed.data.target_value;
  if (parsed.data.target_date  !== undefined) updates.target_date  = parsed.data.target_date;
  if (parsed.data.status       !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "completed") updates.completed_at = now;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data, error } = await svc
    .from("coach_goals")
    .update(updates)
    .eq("id", params.goalId)
    .eq("org_id", params.orgId)
    .select("*")
    .single();

  if (error) {
    console.error("[coach/goals PATCH]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ goal: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { error } = await svc
    .from("coach_goals")
    .delete()
    .eq("id", params.goalId)
    .eq("org_id", params.orgId);

  if (error) {
    console.error("[coach/goals DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
