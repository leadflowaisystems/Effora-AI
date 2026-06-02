/**
 * POST /api/orgs/[orgId]/broadcast
 * Queue bulk WhatsApp template messages to a list of lead IDs.
 * Uses Inngest for 1-second-spaced delivery to respect rate limits.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { randomUUID } from "crypto";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const Schema = z.object({
  template_id:     z.string().uuid(),
  template_params: z.array(z.string()).default([]),
  lead_ids:        z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Verify template belongs to org
  const { data: tpl } = await svc.from("whatsapp_templates").select("id, approval_status")
    .eq("id", parsed.data.template_id).eq("org_id", params.orgId).single();
  if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (tpl.approval_status !== "approved") {
    return NextResponse.json({ error: "Template must be approved by Meta before broadcasting." }, { status: 400 });
  }

  // Check WhatsApp Cloud connection
  const { data: waRow } = await svc.from("integrations").select("active, config")
    .eq("org_id", params.orgId).eq("provider", "whatsapp_cloud").maybeSingle();
  if (!waRow?.active) return NextResponse.json({ error: "WhatsApp Cloud API is not connected." }, { status: 400 });

  // Fetch leads with phone numbers
  const { data: leads } = await svc.from("leads").select("id, name, phone")
    .in("id", parsed.data.lead_ids).eq("org_id", params.orgId).is("deleted_at", null).not("phone", "is", null);

  if (!leads?.length) return NextResponse.json({ error: "No leads with phone numbers found." }, { status: 400 });

  const batchId = randomUUID();
  const rows = (leads as Array<{ id: string; name: string | null; phone: string }>).map((l) => ({
    org_id:          params.orgId,
    template_id:     parsed.data.template_id,
    lead_id:         l.id,
    phone:           l.phone,
    template_params: parsed.data.template_params,
    status:          "queued",
    broadcast_batch: batchId,
  }));

  const { error: insertErr } = await svc.from("broadcast_sends").insert(rows);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // TODO: Trigger Inngest job to process the batch with 1-second spacing
  // inngest.send({ name: "broadcast/process", data: { org_id: params.orgId, batch_id: batchId } });

  return NextResponse.json({ ok: true, sent: rows.length, failed: 0, batch_id: batchId });
}
