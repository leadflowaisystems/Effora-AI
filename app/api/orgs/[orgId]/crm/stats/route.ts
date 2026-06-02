/**
 * GET /api/orgs/[orgId]/crm/stats
 *
 * Query params:
 *   range     — today | week | month | year | all | custom
 *   from      — ISO string for custom range
 *   to        — ISO string for custom range
 *   dateField — created_at | last_seen_at (default: created_at)
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

  const sp         = req.nextUrl.searchParams;
  const range      = parseRange(sp.get("range"));
  const customFrom = sp.get("from");
  const customTo   = sp.get("to");
  const dateField  = sp.get("dateField") === "last_seen_at" ? "last_seen_at" : "created_at";

  const { from, to } = getRangeBounds(range, customFrom, customTo);

  const svc = createServiceClient();
  let query = svc.from("leads")
    .select("stage, score")
    .eq("org_id", params.orgId)
    .is("deleted_at", null)
    .lte(dateField, to);

  if (from) query = query.gte(dateField, from);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows   = (data ?? []) as Array<{ stage: string; score: number }>;
  const total  = rows.length;
  const hot    = rows.filter((r) => r.stage === "hot" || r.score >= 75).length;
  const booked = rows.filter((r) => r.stage === "booked" || r.stage === "booking_sent").length;
  const won    = rows.filter((r) => r.stage === "won" || r.stage === "paid").length;
  const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;

  return NextResponse.json({ range, dateField, total, hot, booked, won, conversion_rate: conversionRate });
}
