/**
 * GET /api/orgs/[orgId]/bookings/stats?range=month
 *
 * Returns booking counts for the given time range.
 * Soft-deleted bookings are excluded (normal soft-delete behaviour).
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (svc as any)
    .from("bookings")
    .select("status, starts_at")
    .eq("org_id", params.orgId)
    .is("deleted_at", null)   // bookings: normal soft-delete, excluded from all views
    .lte("created_at", to);

  if (from) query = query.gte("created_at", from);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{ status: string; starts_at: string | null }>;
  const now  = new Date();

  const total     = rows.length;
  const upcoming  = rows.filter(
    (r) => r.status === "confirmed" && r.starts_at && new Date(r.starts_at) > now
  ).length;
  const completed = rows.filter((r) => r.status === "completed").length;
  const noShows   = rows.filter((r) => r.status === "no_show").length;

  return NextResponse.json({ range, total, upcoming, completed, no_shows: noShows });
}
