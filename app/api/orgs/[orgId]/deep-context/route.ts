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
  target_audience:         z.string().max(1000).optional(),
  transformation_stories:  z.array(z.string().max(500)).max(3).optional(),
  unique_methodology:      z.string().max(200).optional(),
  pricing_philosophy:      z.string().max(500).optional(),
  content_pillars:         z.array(z.string().max(100)).max(5).optional(),
  calendar_preferences:    z.string().max(500).optional(),
  extra_context:           z.string().max(2000).optional(),
}).partial();

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;  // deep_context added in migration 013
  const { error } = await svc.from("orgs").update({
    deep_context: parsed.data,
    updated_at:   new Date().toISOString(),
  }).eq("id", params.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
