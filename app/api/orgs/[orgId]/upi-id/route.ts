/**
 * PUT /api/orgs/[orgId]/upi-id — save or clear the org's UPI ID
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

interface Params { params: { orgId: string } }

async function assertOwner(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return (data as { role: string } | null)?.role === "owner" ? user : null;
}

const Schema = z.object({
  upi_id: z.string().regex(/^[\w.\-]+@[\w]+$/, "Invalid UPI ID format (e.g. name@okhdfc)").or(z.literal("")),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await assertOwner(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // upi_id added in migration 012 — not yet in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { error } = await svc.from("orgs").update({
    upi_id:     parsed.data.upi_id || null,
    updated_at: new Date().toISOString(),
  }).eq("id", params.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
