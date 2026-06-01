import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface Params {
  params: { orgId: string };
}

export async function POST(request: NextRequest, { params }: Params) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is an owner of this org (RLS-guarded read)
  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", params.orgId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const email = (body.email as string | undefined)?.toLowerCase().trim();
  const role: "admin" | "member" = body.role === "admin" ? "admin" : "member";

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Look up the user by email
  const { data: { users }, error: listErr } = await service.auth.admin.listUsers();
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const invitee = users.find((u) => u.email === email);
  if (!invitee) {
    return NextResponse.json(
      { error: "No account found for that email. They must sign up first." },
      { status: 404 }
    );
  }

  const { error: insertErr } = await service.from("org_members").upsert(
    { org_id: params.orgId, user_id: invitee.id, role },
    { onConflict: "org_id,user_id" }
  );

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: invitee.id, role });
}
