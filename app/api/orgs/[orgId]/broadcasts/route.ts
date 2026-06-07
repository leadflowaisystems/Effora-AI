/**
 * GET /api/orgs/[orgId]/broadcasts
 * List broadcasts for the org (excludes permanently deleted).
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

export async function GET(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const includeArchived = req.nextUrl.searchParams.get("archived") === "1";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  let query = svc
    .from("broadcasts")
    .select("id, name, channel, status, send_at, started_at, completed_at, total_recipients, sent_count, failed_count, archived_at, created_at")
    .eq("org_id", params.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ broadcasts: data ?? [] });
}
