/**
 * POST /api/webhooks/manychat-handoff/[orgId]
 *
 * Called from a ManyChat HTTP Request action after the initial trigger fires.
 * Registers the lead in Effora AI so future DMs (via Instagram webhook) are
 * attributed to this lead and Effora AI takes over follow-up.
 *
 * Authentication: X-Webhook-Token header must match the token stored in
 * integrations.config.webhook_token for the org's "manychat" integration.
 *
 * Body: {
 *   ig_user_id:       string,  // Instagram user ID
 *   ig_username:      string,  // Instagram username (optional)
 *   name:             string,  // Display name (optional)
 *   trigger_keyword:  string,  // The ManyChat keyword that fired (optional)
 *   initial_message:  string,  // First message content (optional)
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient }       from "@/lib/supabase/server";
import { inngest }                   from "@/lib/inngest/client";

interface Params { params: { orgId: string } }

async function getManyChatToken(orgId: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("integrations")
    .select("config, active")
    .eq("org_id", orgId)
    .eq("provider", "manychat")
    .maybeSingle();
  if (!data?.active) return null;
  return ((data.config as Record<string, string>).webhook_token) ?? null;
}

export async function POST(req: NextRequest, { params }: Params) {
  const orgId = params.orgId;

  const storedToken = await getManyChatToken(orgId);
  if (!storedToken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const incoming = req.headers.get("x-webhook-token") ?? "";
  if (incoming !== storedToken) {
    console.warn(`[manychat-handoff] token mismatch org=${orgId}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const igUserId  = String(body.ig_user_id  ?? "").trim();
  const igUsername = String(body.ig_username ?? "").trim();
  const name       = String(body.name        ?? "").trim();
  const keyword    = String(body.trigger_keyword  ?? "").trim();
  const initMsg    = String(body.initial_message   ?? "").trim();

  if (!igUserId) {
    return NextResponse.json({ error: "ig_user_id is required" }, { status: 400 });
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();
  const externalId = "ig_" + igUserId;

  // Find or create lead
  const { data: existingLead } = await svc
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("channel", "meta_instagram")
    .eq("external_id", externalId)
    .maybeSingle();

  let leadId: string;

  if (existingLead) {
    leadId = (existingLead as { id: string }).id;
    await svc.from("leads").update({ last_seen_at: now, updated_at: now }).eq("id", leadId);
  } else {
    const displayName = name || igUsername || igUserId;
    const { data: newLead, error: le } = await svc.from("leads").insert({
      org_id:       orgId,
      channel:      "meta_instagram",
      external_id:  externalId,
      name:         displayName,
      stage:        "cold",
      score:        0,
      source:       "manychat_handoff",
      last_seen_at: now,
      updated_at:   now,
    }).select("id").single();

    if (le || !newLead) {
      console.error("[manychat-handoff] lead insert failed:", le?.message);
      return NextResponse.json({ error: "Lead insert failed" }, { status: 500 });
    }
    leadId = (newLead as { id: string }).id;
  }

  // Find or create conversation
  const { data: existingConv } = await svc
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .eq("channel_provider", "meta_instagram")
    .maybeSingle();

  let conversationId: string;

  if (existingConv) {
    conversationId = (existingConv as { id: string }).id;
  } else {
    const preview = initMsg || (keyword ? `ManyChat trigger: ${keyword}` : "Handoff from ManyChat");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newConv, error: ce } = await (svc as any).from("conversations").insert({
      org_id:               orgId,
      lead_id:              leadId,
      channel_provider:     "meta_instagram",
      last_message_at:      now,
      last_message_preview: preview.slice(0, 80),
      auto_reply_enabled:   true,
    }).select("id").single();

    if (ce || !newConv) {
      console.error("[manychat-handoff] conversation insert failed:", ce?.message);
      return NextResponse.json({ error: "Conversation insert failed" }, { status: 500 });
    }
    conversationId = (newConv as { id: string }).id;
  }

  // Insert system message recording the handoff
  const systemContent = keyword
    ? `Lead entered via ManyChat trigger: '${keyword}'`
    : "Lead handed off from ManyChat";

  await svc.from("messages").insert({
    conversation_id: conversationId,
    org_id:          orgId,
    direction:       "inbound",
    content:         systemContent,
    sent_at:         now,
    metadata:        { source: "manychat_handoff", keyword, ig_username: igUsername },
  });

  // If an initial message was provided, insert it too and fire AI pipeline
  if (initMsg) {
    const { data: msg } = await svc.from("messages").insert({
      conversation_id: conversationId,
      org_id:          orgId,
      direction:       "inbound",
      content:         initMsg,
      sent_at:         now,
      metadata:        { source: "manychat_handoff", ig_user_id: igUserId },
    }).select("id").single();

    if (msg) {
      await inngest.send({
        name: "dm.received",
        data: { orgId, leadId, conversationId, messageId: (msg as { id: string }).id },
      });
    }
  }

  await svc.from("conversations").update({
    last_message_at: now,
    last_message_preview: (initMsg || systemContent).slice(0, 80),
  }).eq("id", conversationId);

  console.log(`[manychat-handoff] ✓ lead=${leadId} conv=${conversationId} keyword=${keyword}`);
  return NextResponse.json({ ok: true, leadId, conversationId });
}
