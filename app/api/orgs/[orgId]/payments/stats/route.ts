/**
 * GET /api/orgs/[orgId]/payments/stats?range=month
 *
 * Returns payment totals for the given time range.
 *
 * IMPORTANT — Refinement 1 rule:
 *   Soft-deleted payments (deleted_at IS NOT NULL) are EXCLUDED from the
 *   list view but INCLUDED here so that deleting a row for visual tidiness
 *   does not alter reported revenue. We intentionally omit the
 *   .is("deleted_at", null) filter from these aggregate queries.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseRange, getRangeBounds } from "@/lib/range";

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

export async function GET(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = parseRange(req.nextUrl.searchParams.get("range"));
  const { from, to } = getRangeBounds(range);

  const svc = createServiceClient();

  // Build query — deliberately NO deleted_at filter so totals are accurate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (svc as any)
    .from("payments")
    .select("status, amount_inr")
    .eq("org_id", params.orgId)
    .lte("created_at", to);

  if (from) query = query.gte("created_at", from);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{ status: string; amount_inr: number }>;

  const collected = rows
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + (r.amount_inr ?? 0), 0);

  const pending = rows
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + (r.amount_inr ?? 0), 0);

  const count = rows.length;

  return NextResponse.json({
    range,
    collected,
    pending,
    pipeline: collected + pending,
    count,
  });
}
