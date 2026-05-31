/**
 * PATCH /api/orgs/[orgId]/coach/commitments/[commitmentId]
 * Update commitment status (done | partial | missed | pending) + optional note.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";
import { z } from "zod";

interface Params { params: { orgId: string; commitmentId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const PatchSchema = z.object({
  status:    z.enum(["pending","done","partial","missed","archived"]).optional(),
  notes:     z.string().max(1000).optional(),
  title:     z.string().min(1).max(300).optional(),
  due_date:  z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (parsed.data.status   !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "done") updates.completed_at = now;
  }
  if (parsed.data.notes    !== undefined) updates.notes    = sanitizeText(parsed.data.notes);
  if (parsed.data.title    !== undefined) updates.title    = sanitizeText(parsed.data.title);
  if (parsed.data.due_date !== undefined) updates.due_date = parsed.data.due_date;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data, error } = await svc
    .from("coach_commitments")
    .update(updates)
    .eq("id", params.commitmentId)
    .eq("org_id", params.orgId)
    .select("*")
    .single();

  if (error) {
    console.error("[coach/commitments PATCH]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ commitment: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { error } = await svc
    .from("coach_commitments")
    .delete()
    .eq("id", params.commitmentId)
    .eq("org_id", params.orgId);

  if (error) {
    console.error("[coach/commitments DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
