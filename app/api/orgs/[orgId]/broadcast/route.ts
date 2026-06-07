/**
 * POST /api/orgs/[orgId]/broadcast
 * Queue a broadcast to a list of leads.
 * Creates a broadcasts row + broadcast_deliveries rows.
 * Actual delivery is handled asynchronously (Inngest job or cron).
 * Status lifecycle: queued → sending → completed | partial | failed
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

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
  template_id:     z.string().uuid().optional(),
  template_params: z.array(z.string()).default([]),
  lead_ids:        z.array(z.string().uuid()).min(1).max(500),
  channel:         z.enum(["whatsapp", "instagram", "both"]).default("whatsapp"),
  send_at:         z.string().datetime({ offset: true }).optional(),
  name:            z.string().max(200).optional(),
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

  const { template_id, template_params, lead_ids, channel, send_at, name } = parsed.data;

  // Validate WhatsApp template if using WA or both
  if (channel !== "instagram" && template_id) {
    const { data: tpl } = await svc.from("whatsapp_templates").select("id, approval_status")
      .eq("id", template_id).eq("org_id", params.orgId).single();
    if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (tpl.approval_status !== "approved") {
      return NextResponse.json({ error: "Template must be approved by Meta before broadcasting." }, { status: 400 });
    }
  }

  // Check WhatsApp connection for WA/both
  if (channel !== "instagram") {
    const { data: waRow } = await svc.from("integrations").select("active")
      .eq("org_id", params.orgId).eq("provider", "whatsapp_cloud").maybeSingle();
    if (!waRow?.active) return NextResponse.json({ error: "WhatsApp Cloud API is not connected." }, { status: 400 });
  }

  // Fetch all requested leads
  const { data: allLeads } = await svc.from("leads")
    .select("id, name, phone, channel")
    .in("id", lead_ids)
    .eq("org_id", params.orgId)
    .is("deleted_at", null);

  const leads = (allLeads ?? []) as Array<{ id: string; name: string | null; phone: string | null; channel: string }>;

  // Filter leads by channel selection
  function recipientChannel(leadChannel: string): "whatsapp" | "instagram" | null {
    const lc = leadChannel?.toLowerCase();
    if (channel === "both") {
      if (lc === "whatsapp" || lc === "whatsapp_cloud") return "whatsapp";
      if (lc === "instagram") return "instagram";
      return null;
    }
    if (channel === "whatsapp" && (lc === "whatsapp" || lc === "whatsapp_cloud")) {
      if (!leads.find((l) => l.id)?.phone) return null; // phone checked below
      return "whatsapp";
    }
    if (channel === "instagram" && lc === "instagram") return "instagram";
    return null;
  }

  const recipients = leads.filter((l) => {
    const rc = recipientChannel(l.channel);
    if (!rc) return false;
    if (rc === "whatsapp" && !l.phone) return false;
    return true;
  });

  if (!recipients.length) {
    return NextResponse.json({ error: "No eligible recipients found for the selected channel(s)." }, { status: 400 });
  }

  const sendAt = send_at ? new Date(send_at).toISOString() : new Date().toISOString();
  const isScheduled = send_at && new Date(send_at) > new Date();

  // Create the broadcast record
  const { data: broadcast, error: bErr } = await svc.from("broadcasts").insert({
    org_id:            params.orgId,
    name:              name ?? null,
    channel,
    message_template:  template_params.join(", ") || "template",
    template_id:       template_id ?? null,
    variables:         template_params.length ? { params: template_params } : null,
    status:            isScheduled ? "queued" : "sending",
    send_at:           sendAt,
    started_at:        isScheduled ? null : new Date().toISOString(),
    total_recipients:  recipients.length,
    sent_count:        0,
    failed_count:      0,
    created_by:        user.id,
  }).select("id").single();

  if (bErr || !broadcast) {
    return NextResponse.json({ error: bErr?.message ?? "Failed to create broadcast" }, { status: 500 });
  }

  const broadcastId = (broadcast as { id: string }).id;

  // Create delivery records for each recipient
  const deliveryRows = recipients.map((l) => ({
    broadcast_id:     broadcastId,
    lead_id:          l.id,
    channel:          recipientChannel(l.channel),
    rendered_message: template_params.length ? template_params.join(" ") : null,
    status:           "pending",
  }));

  const { error: dErr } = await svc.from("broadcast_deliveries").insert(deliveryRows);
  if (dErr) {
    // Roll back broadcast row on delivery insert failure
    await svc.from("broadcasts").delete().eq("id", broadcastId);
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  // For immediately-sent broadcasts: update status to queued (Inngest will pick up)
  // Inngest: await inngest.send({ name: "broadcast/process", data: { org_id: params.orgId, broadcast_id: broadcastId } })
  // For now the status stays as "sending" so the history shows it in-flight

  return NextResponse.json({
    ok:           true,
    broadcast_id: broadcastId,
    sent:         recipients.length,
    failed:       0,
    scheduled:    isScheduled,
  });
}
