/**
 * GET /api/orgs/[orgId]/bookings/stats
 *
 * Query params:
 *   range    — today | week | month | year | all | custom
 *   from     — ISO string for custom range
 *   to       — ISO string for custom range
 *   category — all | upcoming | completed | no_show (default: all)
 *
 * For "upcoming" the window is FORWARD-looking (starts_at >= now).
 * For other categories the window is BACKWARD-looking (starts_at in range).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseRange, getRangeBounds, getFutureBounds } from "@/lib/range";

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
  const category   = sp.get("category") ?? "all";

  const svc = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (svc as any)
    .from("bookings")
    .select("status, starts_at")
    .eq("org_id", params.orgId)
    .is("deleted_at", null);  // bookings: normal soft-delete

  if (category === "upcoming") {
    // Forward-looking window
    const { from, to } = getFutureBounds(range, customTo);
    query = query.gte("starts_at", from);
    if (to) query = query.lte("starts_at", to);
    query = query.eq("status", "confirmed");
  } else {
    // Backward-looking window on created_at
    const { from, to } = getRangeBounds(range, customFrom, customTo);
    query = query.lte("created_at", to);
    if (from) query = query.gte("created_at", from);
    if (category === "completed") query = query.eq("status", "completed");
    if (category === "no_show")   query = query.eq("status", "no_show");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{ status: string; starts_at: string | null }>;
  const now  = new Date();

  const total     = rows.length;
  const upcoming  = rows.filter((r) => r.status === "confirmed" && r.starts_at && new Date(r.starts_at) > now).length;
  const completed = rows.filter((r) => r.status === "completed").length;
  const noShows   = rows.filter((r) => r.status === "no_show").length;
  const completionRate = (completed + noShows) > 0
    ? Math.round((completed / (completed + noShows)) * 100)
    : 0;

  return NextResponse.json({ range, total, upcoming, completed, no_shows: noShows, completion_rate: completionRate });
}
