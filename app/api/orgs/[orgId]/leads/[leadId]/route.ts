import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";
import { z } from "zod";
import { invalidateAccessCache } from "@/lib/access";

interface Params { params: { orgId: string; leadId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const UpdateSchema = z.object({
  name:    z.string().min(1).max(200).optional(),
  stage:   z.string().max(30).optional(),
  score:   z.number().min(0).max(100).optional(),
  tags:    z.array(z.string().max(50)).max(20).optional(),
  notes:   z.string().max(5000).optional(),
  ltv_inr: z.number().min(0).optional(),
}).partial();

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name    !== undefined) updates.name    = sanitizeText(parsed.data.name);
  if (parsed.data.stage   !== undefined) updates.stage   = parsed.data.stage;
  if (parsed.data.score   !== undefined) updates.score   = parsed.data.score;
  if (parsed.data.tags    !== undefined) updates.tags    = parsed.data.tags;
  if (parsed.data.notes   !== undefined) updates.notes   = sanitizeText(parsed.data.notes);
  if (parsed.data.ltv_inr !== undefined) updates.ltv_inr = parsed.data.ltv_inr;

  // Cast to any — tags/notes/ltv_inr/deleted_at added in migration 012, not yet in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data, error } = await svc.from("leads")
    .update(updates).eq("id", params.leadId).eq("org_id", params.orgId)
    .select("id, name, stage, score, tags, notes, ltv_inr").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { error } = await svc.from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.leadId).eq("org_id", params.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Suppress unused import warning — kept for future plan-change hooks
void invalidateAccessCache;
