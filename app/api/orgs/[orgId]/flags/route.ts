/**
 * GET  /api/orgs/[orgId]/flags  — return user flags for current user
 * POST /api/orgs/[orgId]/flags  — upsert a flag
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

  // user_flags table added in migration 011 — cast to bypass stale generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data } = await svc.from("user_flags")
    .select("has_completed_first_run")
    .eq("user_id", user.id).eq("org_id", params.orgId).single();

  return NextResponse.json({ flags: data ?? { has_completed_first_run: false } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const { error } = await svc.from("user_flags").upsert({
    user_id:                 user.id,
    org_id:                  params.orgId,
    has_completed_first_run: body.has_completed_first_run ?? false,
    updated_at:              new Date().toISOString(),
  }, { onConflict: "user_id,org_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
