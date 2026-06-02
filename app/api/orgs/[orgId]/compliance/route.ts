/**
 * GET  /api/orgs/[orgId]/compliance?flag=broadcast_policy_accepted
 * POST /api/orgs/[orgId]/compliance   { flag: string }
 *
 * Stores/reads compliance acceptance flags in user_flags.compliance_flags JSONB.
 *
 * Schema reality: user_flags has user_id UUID PRIMARY KEY (no org_id column).
 * We scope flags by org_id INSIDE the JSONB:
 *   compliance_flags = { "<orgId>": { "broadcast_policy_accepted": "<iso-timestamp>" } }
 *
 * Requires migration 020 (adds compliance_flags JSONB column).
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
    .eq("user_id", user.id).maybeSingle();

  const allFlags  = (data as { compliance_flags?: Record<string, Record<string, unknown>> } | null)?.compliance_flags ?? {};
  const orgFlags  = allFlags[params.orgId] ?? {};
  return NextResponse.json({ accepted: !!orgFlags[flag] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { flag?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.flag) return NextResponse.json({ error: "flag required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Load existing row
  const { data: existing } = await svc.from("user_flags").select("user_id, compliance_flags")
    .eq("user_id", user.id).maybeSingle();

  const current = (existing as { compliance_flags?: Record<string, Record<string, unknown>> } | null)?.compliance_flags ?? {};
  const orgFlags = current[params.orgId] ?? {};
  const updated  = {
    ...current,
    [params.orgId]: { ...orgFlags, [body.flag]: new Date().toISOString() },
  };

  if (existing) {
    await svc.from("user_flags").update({ compliance_flags: updated })
      .eq("user_id", user.id);
  } else {
    // Insert new row — is_agency defaults to false
    await svc.from("user_flags").insert({
      user_id:          user.id,
      compliance_flags: updated,
    });
  }

  return NextResponse.json({ ok: true });
}
