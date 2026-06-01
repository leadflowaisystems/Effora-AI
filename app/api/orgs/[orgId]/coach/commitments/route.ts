/**
 * GET  /api/orgs/[orgId]/coach/commitments  — list commitments
 * POST /api/orgs/[orgId]/coach/commitments  — create a commitment
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
  const a = await getAccessState(orgId);
  return a.canUseAccountability ? null : NextResponse.json({ error: "Accountability Coach requires Growth plan or above." }, { status: 403 });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await assertAccountability(params.orgId);
  if (gate) return gate;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data, error } = await svc
    .from("coach_commitments")
    .select("*")
    .eq("org_id", params.orgId)
    .order("due_date", { ascending: true })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ commitments: data ?? [] });
}

const CreateSchema = z.object({
  title:    z.string().min(1).max(300),
  due_date: z.string().min(1),
  notes:    z.string().max(1000).optional(),
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

  const { data, error } = await svc.from("coach_commitments").insert({
    org_id:     params.orgId,
    title:      sanitizeText(parsed.data.title),
    due_date:   parsed.data.due_date,
    notes:      sanitizeText(parsed.data.notes) || null,
    status:     "pending",
    created_at: now,
  }).select("*").single();

  if (error) {
    console.error("[coach/commitments POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ commitment: data });
}
