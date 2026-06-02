/**
 * DELETE /api/orgs/[orgId]/payments/[paymentId]
 * Soft-deletes a payment by setting deleted_at = NOW().
 * The GET /api/orgs/[orgId]/payments list query filters .is("deleted_at", null).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string; paymentId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any)
    .from("payments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.paymentId)
    .eq("org_id", params.orgId);

  if (error) {
    console.error("[payments/delete]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
