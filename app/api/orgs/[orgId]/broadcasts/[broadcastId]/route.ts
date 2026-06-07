/**
 * DELETE /api/orgs/[orgId]/broadcasts/[broadcastId]
 *   ?mode=archive  — soft-archive (hidden from default list, kept in DB)
 *   ?mode=hard     — permanently deletes the row
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string; broadcastId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = req.nextUrl.searchParams.get("mode") ?? "archive";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  if (mode === "hard") {
    const { error } = await svc
      .from("broadcasts")
      .delete()
      .eq("id", params.broadcastId)
      .eq("org_id", params.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await svc
      .from("broadcasts")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", params.broadcastId)
      .eq("org_id", params.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
