/**
 * PUT /api/orgs/[orgId]/payment-mode
 * Save the org's preferred payment method strategy.
 *
 * Validates that the required method is actually configured before
 * allowing an exclusive mode to be saved, so payment generation
 * can't be left in a broken state.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

interface Params { params: { orgId: string } }

async function assertOwner(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();
  return (data as { role: string } | null)?.role === "owner" ? user : null;
}

const Schema = z.object({
  payment_mode: z.enum(["razorpay_only", "upi_only", "both"]),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await assertOwner(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { payment_mode } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Validate that the required method(s) are configured
  if (payment_mode === "razorpay_only") {
    const { data: rzp } = await svc
      .from("integrations")
      .select("active")
      .eq("org_id", params.orgId)
      .eq("provider", "razorpay")
      .eq("active", true)
      .maybeSingle();
    if (!rzp?.active) {
      return NextResponse.json(
        { error: "Connect and save your Razorpay API keys before switching to Razorpay Only mode." },
        { status: 400 },
      );
    }
  }

  if (payment_mode === "upi_only") {
    const { data: orgData } = await svc
      .from("orgs")
      .select("upi_id")
      .eq("id", params.orgId)
      .single();
    if (!(orgData as { upi_id: string | null } | null)?.upi_id) {
      return NextResponse.json(
        { error: "Save a UPI ID before switching to UPI Only mode." },
        { status: 400 },
      );
    }
  }

  if (payment_mode === "both") {
    const [rzpRes, orgRes] = await Promise.all([
      svc.from("integrations").select("active").eq("org_id", params.orgId).eq("provider", "razorpay").eq("active", true).maybeSingle(),
      svc.from("orgs").select("upi_id").eq("id", params.orgId).single(),
    ]);
    const hasRazorpay = !!(rzpRes.data as { active: boolean } | null)?.active;
    const hasUpi      = !!(orgRes.data  as { upi_id: string | null } | null)?.upi_id;
    if (!hasRazorpay && !hasUpi) {
      return NextResponse.json(
        { error: "Configure at least one payment method (Razorpay or UPI ID) before saving." },
        { status: 400 },
      );
    }
  }

  const { error } = await svc
    .from("orgs")
    .update({ payment_mode, updated_at: new Date().toISOString() })
    .eq("id", params.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
