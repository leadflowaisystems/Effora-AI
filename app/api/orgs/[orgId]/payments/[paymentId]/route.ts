/**
 * PATCH /api/orgs/[orgId]/payments/[paymentId]
 *   Update template_active / next_run_at / template_name on a recurring template.
 *
 * DELETE /api/orgs/[orgId]/payments/[paymentId]
 *
 * Two distinct modes, selected by ?mode=
 *
 * ── ?mode=archive  (default when no mode is supplied) ────────────────────────
 *   "Delete Record" — CRM / lead-history cleanup only.
 *
 *   • Sets deleted_at on the payment row  →  hidden from lead detail & CRM lists.
 *   • Soft-deletes all lead_events tied to this payment  →  hidden from timeline.
 *   • Payment row is NOT removed from the database.
 *   • Stats endpoint deliberately ignores deleted_at (Refinement-1 rule), so:
 *       - Collected revenue totals  UNCHANGED
 *       - Pending totals            UNCHANGED
 *       - Dashboard metrics         UNCHANGED
 *       - Historical reports        UNCHANGED
 *
 * ── ?mode=hard ───────────────────────────────────────────────────────────────
 *   "Delete Payment" — permanent financial deletion.
 *
 *   • Hard-deletes the payment row from the database.
 *   • Hard-deletes all associated lead_events.
 *   • Because the row is gone, the stats endpoint will NO LONGER count it:
 *       - Paid payment   → collected revenue DECREASES by amount_inr
 *       - Pending payment → pending total    DECREASES by amount_inr
 *   • Irreversible. Requires client-side confirmation before calling.
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

  const mode = req.nextUrl.searchParams.get("mode") ?? "archive";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc  = createServiceClient() as any;
  const now  = new Date().toISOString();

  // Load payment before any mutation so we have lead_id + amount for the audit event
  const { data: pay } = await svc
    .from("payments")
    .select("lead_id, amount_inr, status")
    .eq("id", params.paymentId)
    .eq("org_id", params.orgId)
    .single();

  const leadId    = (pay as { lead_id: string; amount_inr: number; status: string } | null)?.lead_id  ?? null;
  const amountInr = (pay as { lead_id: string; amount_inr: number; status: string } | null)?.amount_inr ?? 0;
  const status    = (pay as { lead_id: string; amount_inr: number; status: string } | null)?.status    ?? "unknown";

  // ── ARCHIVE ("Delete Record") ─────────────────────────────────────────────
  // CRM visibility only. Revenue + dashboard metrics are UNAFFECTED because
  // the stats endpoint excludes deleted_at from its filter (Refinement-1 rule).
  if (mode === "archive") {
    const { error: payErr } = await svc
      .from("payments")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", params.paymentId)
      .eq("org_id", params.orgId);

    if (payErr) {
      console.error("[payments/archive]", payErr.message);
      return NextResponse.json({ error: payErr.message }, { status: 500 });
    }

    // Soft-delete every lead_event tied to this payment so the timeline stays clean.
    // This does NOT delete accounting data — just hides the CRM annotation.
    await svc
      .from("lead_events")
      .update({ deleted_at: now })
      .eq("org_id", params.orgId)
      .eq("entity_type", "payment")
      .eq("entity_id", params.paymentId);

    // No new event written — the record is simply hidden, not destroyed.
    return NextResponse.json({ ok: true, mode: "archive" });
  }

  // ── HARD DELETE ("Delete Payment") ───────────────────────────────────────
  // Permanently removes the payment row and all associated audit entries.
  // The stats endpoint will no longer see this row, so financial totals change:
  //   paid    → collected revenue decreases by amount_inr
  //   pending → pending total decreases by amount_inr
  if (mode === "hard") {
    const { error: delErr } = await svc
      .from("payments")
      .delete()
      .eq("id", params.paymentId)
      .eq("org_id", params.orgId);

    if (delErr) {
      console.error("[payments/hard-delete]", delErr.message);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    // Hard-delete every lead_event tied to this payment.
    await svc
      .from("lead_events")
      .delete()
      .eq("org_id", params.orgId)
      .eq("entity_type", "payment")
      .eq("entity_id", params.paymentId);

    // Write a brief audit trail noting the permanent deletion.
    if (leadId) {
      void writeLeadEvent({
        orgId:      params.orgId,
        leadId,
        eventType:  "payment_deleted",
        entityType: "payment",
        entityId:   params.paymentId,
        title:      `Payment permanently deleted — ₹${amountInr.toLocaleString("en-IN")} (${status})`,
        metadata:   { amount_inr: amountInr, status },
      });
    }

    return NextResponse.json({ ok: true, mode: "hard" });
  }

  return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
}
