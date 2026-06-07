/**
 * DELETE /api/orgs/[orgId]/payments/[paymentId]
 *
 * Without query params:  soft-delete — sets deleted_at = NOW().
 *   Payment is hidden from the list but preserved for reports + lead history.
 *
 * ?mode=hard:            hard delete — permanently removes the payment row.
 *   Disappears from lists, revenue totals, and lead history.
 *   Requires client-side confirmation before calling.
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

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = req.nextUrl.searchParams.get("mode");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc  = createServiceClient() as any;

  if (mode === "hard") {
    // Permanent deletion — remove the row entirely.
    const { error } = await svc
      .from("payments")
      .delete()
      .eq("id", params.paymentId)
      .eq("org_id", params.orgId);

    if (error) {
      console.error("[payments/hard-delete]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    // Soft delete — hide from list, preserve for reports + lead history.
    const { error } = await svc
      .from("payments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", params.paymentId)
      .eq("org_id", params.orgId);

    if (error) {
      console.error("[payments/soft-delete]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
