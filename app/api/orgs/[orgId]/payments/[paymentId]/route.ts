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
import { writeLeadEvent } from "@/lib/lead-events";

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

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc  = createServiceClient() as any;

  const allowed = ["template_active", "next_run_at", "template_name"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = (body as Record<string, unknown>)[k];
  }
  update.updated_at = new Date().toISOString();

  const { error } = await svc
    .from("payments")
    .update(update)
    .eq("id", params.paymentId)
    .eq("org_id", params.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = req.nextUrl.searchParams.get("mode");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc  = createServiceClient() as any;

  // Fetch lead_id before deleting so we can write the event
  const { data: pay } = await svc
    .from("payments")
    .select("lead_id, amount_inr")
    .eq("id", params.paymentId)
    .eq("org_id", params.orgId)
    .single();
  const leadId   = (pay as { lead_id: string; amount_inr: number } | null)?.lead_id ?? null;
  const amountInr = (pay as { lead_id: string; amount_inr: number } | null)?.amount_inr ?? 0;

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

    // Remove all lead_events tied to this payment entity so they don't linger
    // in the activity timeline after the payment is gone.
    await svc
      .from("lead_events")
      .delete()
      .eq("org_id", params.orgId)
      .eq("entity_type", "payment")
      .eq("entity_id", params.paymentId);

    if (leadId) {
      void writeLeadEvent({
        orgId: params.orgId, leadId,
        eventType: "payment_deleted", entityType: "payment", entityId: params.paymentId,
        title: `Payment permanently deleted — ₹${amountInr.toLocaleString("en-IN")}`,
        metadata: { amount_inr: amountInr },
      });
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
    if (leadId) {
      void writeLeadEvent({
        orgId: params.orgId, leadId,
        eventType: "payment_archived", entityType: "payment", entityId: params.paymentId,
        title: `Payment removed from list — ₹${amountInr.toLocaleString("en-IN")}`,
        metadata: { amount_inr: amountInr },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
