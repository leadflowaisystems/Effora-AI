/**
 * GET  /api/orgs/[orgId]/sequences           — sequence runs + inactive leads
 * POST /api/orgs/[orgId]/sequences           — stop a sequence run
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string } }

const INACTIVE_DAYS = parseInt(process.env.REVIVAL_INACTIVE_DAYS ?? "14", 10);

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc    = createServiceClient();
  const orgId  = params.orgId;
  const cursor = req.nextUrl.searchParams.get("cursor");
  const limit  = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 100);

  let runsQuery = svc.from("sequence_runs")
    .select(`
      id, type, status, step_current, step_total, metadata,
      started_at, updated_at, stopped_at,
      lead:leads(id, name, avatar_url, stage, channel)
    `)
    .eq("org_id", orgId)
    .order("started_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) runsQuery = runsQuery.lt("started_at", cursor);

  const [runRes, inactiveRes] = await Promise.all([
    runsQuery,

    // Inactive leads not currently in an active revival
    svc.from("leads")
      .select("id, name, avatar_url, stage, channel, last_seen_at, score")
      .eq("org_id", orgId)
      .lt("last_seen_at", new Date(Date.now() - INACTIVE_DAYS * 86400000).toISOString())
      .not("stage", "in", '("booked","booking_sent","qualified","won","paid","churned")')
      .order("last_seen_at", { ascending: true })
      .limit(30),
  ]);

  // Filter out inactive leads that already have an active revival
  const activeRevivalLeadIds = new Set(
    (runRes.data ?? [])
      .filter((r) => r.type === "ghost_revival" && r.status === "active")
      .map((r) => {
        const l = r.lead as unknown as { id: string } | null;
        return l?.id;
      })
      .filter(Boolean) as string[]
  );

  const inactiveLeads = (inactiveRes.data ?? []).filter(
    (l) => !activeRevivalLeadIds.has(l.id)
  );

  const rows       = runRes.data ?? [];
  const hasMore    = rows.length > limit;
  const items      = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.started_at ?? null : null;

  return NextResponse.json({
    sequenceRuns: items,
    inactiveLeads,
    inactiveDaysThreshold: INACTIVE_DAYS,
    next_cursor: nextCursor,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { sequenceRunId, action } = body as { sequenceRunId?: string; action?: string };

  if (!sequenceRunId) return NextResponse.json({ error: "sequenceRunId required" }, { status: 400 });
  if (action !== "stop") return NextResponse.json({ error: "action must be 'stop'" }, { status: 400 });

  const svc = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await svc.from("sequence_runs").update({
    status:     "stopped",
    stopped_at: now,
    updated_at: now,
  }).eq("id", sequenceRunId).eq("org_id", params.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
