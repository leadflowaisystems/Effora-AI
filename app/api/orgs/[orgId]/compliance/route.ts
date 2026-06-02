/**
 * GET  /api/orgs/[orgId]/compliance?flag=broadcast_policy_accepted
 * POST /api/orgs/[orgId]/compliance   { flag: string }
 *
 * Stores/reads compliance acceptance flags in user_flags.compliance_flags JSONB.
 * Requires migration 020 to add the compliance_flags column.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string } }

async function getUser(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const flag = req.nextUrl.searchParams.get("flag");
  if (!flag) return NextResponse.json({ error: "flag required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data } = await svc.from("user_flags").select("compliance_flags")
    .eq("user_id", user.id).eq("org_id", params.orgId).maybeSingle();

  const flags = (data as { compliance_flags?: Record<string, unknown> } | null)?.compliance_flags ?? {};
  return NextResponse.json({ accepted: !!flags[flag] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { flag?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.flag) return NextResponse.json({ error: "flag required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Upsert the user_flags row, merging the new flag into compliance_flags
  const { data: existing } = await svc.from("user_flags").select("id, compliance_flags")
    .eq("user_id", user.id).eq("org_id", params.orgId).maybeSingle();

  const flags = { ...((existing as { compliance_flags?: Record<string, unknown> } | null)?.compliance_flags ?? {}), [body.flag]: new Date().toISOString() };

  if (existing) {
    await svc.from("user_flags").update({ compliance_flags: flags, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id);
  } else {
    await svc.from("user_flags").insert({
      user_id:         user.id,
      org_id:          params.orgId,
      compliance_flags: flags,
    });
  }

  return NextResponse.json({ ok: true });
}
