/**
 * POST /api/webhooks/manychat/[orgId]
 *
 * Receives forwarded DMs from ManyChat External Request steps.
 *
 * Authentication: X-Webhook-Token header must match the token stored in
 * integrations.config.webhook_token for this org's "manychat" provider.
 *
 * Expected JSON body (ManyChat variables):
 * {
 *   "subscriber_id": "{{subscriber id}}",   // ManyChat subscriber ID
 *   "name":          "{{full name}}",        // Subscriber's full name
 *   "message":       "{{last input text}}"   // The DM text
 * }
 *
 * On success:
 *   - Upsert lead (channel="manychat", external_id=subscriber_id)
 *   - Upsert conversation
 *   - Insert inbound message
 *   - Fire dm.received Inngest event → qualifyLead + draftReply pipeline
 *   - Return { ok: true, conversationId, leadId }
 *
 * ManyChat setup:
 *   1. Open your flow → add External Request step
 *   2. Method: POST, URL: https://<domain>/api/webhooks/manychat/<orgId>
 *   3. Header: X-Webhook-Token = <token from Settings → Channel → ManyChat>
 *   4. Body: {"subscriber_id":"{{subscriber id}}","name":"{{full name}}","message":"{{last input text}}"}
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

interface Params { params: { orgId: string } }

// ── Token verification ──────────────────────────────────────
async function getWebhookToken(orgId: string): Promise<string | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("integrations")
      .select("config, active")
      .eq("org_id", orgId)
      .eq("provider", "manychat")
      .single();

    if (!data?.active) return null;
    const config = (data.config as Record<string, unknown>) ?? {};
    return (config.webhook_token as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const orgId = params.orgId;

  // ── Auth ─────────────────────────────────────────────────
  const storedToken = await getWebhookToken(orgId);
  if (!storedToken) {
    // Integration not configured or not active — return 404 to hide existence
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const incomingToken = req.headers.get("x-webhook-token") ?? "";
  if (incomingToken !== storedToken) {
    console.warn(`[manychat-webhook] token mismatch for org ${orgId}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subscriberId = String(body.subscriber_id ?? "").trim();
  const name         = String(body.name          ?? "").trim();
  const message      = String(body.message       ?? "").trim();

  if (!subscriberId) {
    return NextResponse.json({ error: "subscriber_id is required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();

  // ── Upsert lead ───────────────────────────────────────────
  const { data: existingLead } = await svc
    .from("leads")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("channel", "manychat")
    .eq("external_id", subscriberId)
    .maybeSingle();

  let leadId: string;

  if (existingLead) {
    leadId = (existingLead as { id: string }).id;
    // Update name if we have a better one (ManyChat sometimes sends full name later)
    if (name && name !== (existingLead as { name: string | null }).name) {
      await svc.from("leads").update({ name, last_seen_at: now, updated_at: now })
        .eq("id", leadId);
    } else {
      await svc.from("leads").update({ last_seen_at: now, updated_at: now })
        .eq("id", leadId);
    }
  } else {
    const { data: newLead, error: le } = await svc.from("leads").insert({
      org_id:      orgId,
      channel:     "manychat",
      external_id: subscriberId,
      name:        name || subscriberId,
      stage:       "cold",
      score:       0,
      source:      "manychat",
      last_seen_at: now,
      updated_at:  now,
    }).select("id").single();

    if (le || !newLead) {
      console.error("[manychat-webhook] lead insert failed:", le?.message);
      return NextResponse.json({ error: "Lead insert failed" }, { status: 500 });
    }
    leadId = (newLead as { id: string }).id;
  }

  // ── Upsert conversation ───────────────────────────────────
  const { data: existingConv } = await svc
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .eq("channel_provider", "manychat")
    .maybeSingle();

  let conversationId: string;

  if (existingConv) {
    conversationId = (existingConv as { id: string }).id;
  } else {
    const { data: newConv, error: ce } = await svc.from("conversations").insert({
      org_id:               orgId,
      lead_id:              leadId,
      channel_provider:     "manychat",
      last_message_at:      now,
      last_message_preview: message.slice(0, 80),
    }).select("id").single();

    if (ce || !newConv) {
      console.error("[manychat-webhook] conversation insert failed:", ce?.message);
      return NextResponse.json({ error: "Conversation insert failed" }, { status: 500 });
    }
    conversationId = (newConv as { id: string }).id;
  }

  // ── Insert message ────────────────────────────────────────
  const { data: msg, error: me } = await svc.from("messages").insert({
    conversation_id: conversationId,
    org_id:          orgId,
    direction:       "inbound",
    content:         message,
    sent_at:         now,
    metadata:        { source: "manychat", subscriber_id: subscriberId },
  }).select("id").single();

  if (me || !msg) {
    console.error("[manychat-webhook] message insert failed:", me?.message);
    return NextResponse.json({ error: "Message insert failed" }, { status: 500 });
  }
  const messageId = (msg as { id: string }).id;

  // ── Update conversation preview ────────────────────────────
  await svc.from("conversations").update({
    last_message_at:      now,
    last_message_preview: message.slice(0, 80),
  }).eq("id", conversationId);

  // ── Emit Inngest event ─────────────────────────────────────
  await inngest.send({
    name: "dm.received",
    data: { orgId, leadId, conversationId, messageId },
  });

  console.log(`[manychat-webhook] ✓ dm received  lead=${leadId}  conv=${conversationId}`);
  return NextResponse.json({ ok: true, conversationId, leadId });
}
