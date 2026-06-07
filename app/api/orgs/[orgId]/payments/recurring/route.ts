/**
 * GET  /api/orgs/[orgId]/payments/recurring  — list recurring payment templates
 * POST /api/orgs/[orgId]/payments/recurring  — create recurring payment template
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { writeLeadEvent } from "@/lib/lead-events";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data, error } = await svc
    .from("payments")
    .select(`
      id, payment_type, recurrence_frequency, next_run_at, last_run_at,
      template_name, template_active, amount_inr, notes, created_at, updated_at,
      lead:leads(id, name, avatar_url, stage, channel)
    `)
    .eq("org_id", params.orgId)
    .eq("payment_type", "recurring")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recurring: data ?? [] });
}

const Schema = z.object({
  lead_id:               z.string().uuid(),
  amount_inr:            z.number().positive(),
  description:           z.string().min(1).max(500),
  template_name:         z.string().min(1).max(200),
  recurrence_frequency:  z.enum(["daily", "weekly", "monthly", "yearly"]),
  first_run_at:          z.string().datetime({ offset: true }).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { lead_id, amount_inr, description, template_name, recurrence_frequency, first_run_at } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const now = new Date().toISOString();

  const nextRunAt = first_run_at ?? now;

  const { data: payment, error } = await svc.from("payments").insert({
    org_id:               params.orgId,
    lead_id,
    amount_inr,
    status:               "pending",
    notes:                description,
    payment_type:         "recurring",
    recurrence_frequency,
    next_run_at:          nextRunAt,
    template_name,
    template_active:      true,
    created_at:           now,
    updated_at:           now,
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const p = payment as { id: string };

  void writeLeadEvent({
    orgId:      params.orgId,
    leadId:     lead_id,
    eventType:  "payment_created",
    entityType: "payment",
    entityId:   p.id,
    title:      `Recurring payment set up — ₹${amount_inr.toLocaleString("en-IN")} ${recurrence_frequency}`,
    metadata:   { amount_inr, description, recurrence_frequency, payment_type: "recurring" },
  });

  return NextResponse.json({ ok: true, payment_id: p.id });
}
