/**
 * GET /api/orgs/[orgId]/payments/stats
 *
 * Query params:
 *   range  — today | week | month | year | all | custom (default: month)
 *   from   — ISO string, used when range=custom
 *   to     — ISO string, used when range=custom
 *   status — all | paid | pending (default: all)
 *
 * IMPORTANT — Refinement 1 rule:
 *   Soft-deleted payments (deleted_at IS NOT NULL) are EXCLUDED from list
 *   views but INCLUDED here so deleting a row for visual tidiness does not
 *   alter reported revenue.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseRange, getRangeBounds } from "@/lib/range";
import { withErrorHandler } from "@/lib/api-handler";

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

async function handler(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const range      = parseRange(sp.get("range"));
  const customFrom = sp.get("from");
  const customTo   = sp.get("to");
  const statusFilter = sp.get("status") ?? "all";  // all | paid | pending

  const { from, to } = getRangeBounds(range, customFrom, customTo);

  const svc = createServiceClient();

  // Deliberately NO deleted_at filter — soft-deleted payments still count in totals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (svc as any)
    .from("payments")
    .select("status, amount_inr")
    .eq("org_id", params.orgId)
    .lte("created_at", to);

  if (from) query = query.gte("created_at", from);
  if (statusFilter === "paid")    query = query.eq("status", "paid");
  if (statusFilter === "pending") query = query.eq("status", "pending");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{ status: string; amount_inr: number }>;

  const collected = rows.filter((r) => r.status === "paid").reduce((s, r) => s + (r.amount_inr ?? 0), 0);
  const pending   = rows.filter((r) => r.status === "pending").reduce((s, r) => s + (r.amount_inr ?? 0), 0);
  const count     = rows.length;

  return NextResponse.json({ range, collected, pending, pipeline: collected + pending, count });
}

export const GET = withErrorHandler("payments/stats", handler);
