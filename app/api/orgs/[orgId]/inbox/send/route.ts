/**
 * POST /api/orgs/[orgId]/inbox/send
 *
 * Simulates an inbound DM for testing (manual channel).
 * Creates / upserts: lead → conversation → message → emits dm.received.
 *
 * Body: { senderName?: string; senderHandle?: string; content: string }
 * Returns: { conversationId, leadId, messageId }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";
import { sanitizeText } from "@/lib/sanitize";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export const POST = withErrorHandler("inbox/send", async (req: NextRequest, { params }: Params) => {
  const { allowed } = await rateLimitAsync(`inbox-send:${getIp(req)}`, { limit: 30 });
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });

  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const SendSchema = z.object({
    content:       z.string().min(1, "content is required").max(4000),
    senderName:    z.string().max(200).optional(),
    senderHandle:  z.string().max(200).optional(),
  });

  const raw    = await req.json().catch(() => ({}));
  const parsed = SendSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues?.[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const externalId = sanitizeText(parsed.data.senderHandle) || `manual_${Date.now()}`;
  const name       = sanitizeText(parsed.data.senderName)   || externalId;
  const content    = sanitizeText(parsed.data.content);
  const now        = new Date().toISOString();
  const svc        = createServiceClient();

  // ── Upsert lead ───────────────────────────────────────────
  const { data: existingLead } = await svc
    .from("leads").select("id")
    .eq("org_id", params.orgId).eq("channel", "manual").eq("external_id", externalId)
    .single();

  let leadId: string;

  if (existingLead) {
    leadId = (existingLead as { id: string }).id;
    await svc.from("leads").update({ name, last_seen_at: now, updated_at: now })
      .eq("id", leadId);
  } else {
    const { data: newLead, error: le } = await svc.from("leads").insert({
      org_id:      params.orgId,
      channel:     "manual",
      external_id: externalId,
      name,
      stage:       "cold",
      score:       0,
      source:      "manual",
      last_seen_at: now,
      updated_at:  now,
    }).select("id").single();

    if (le || !newLead) {
      return NextResponse.json({ error: le?.message ?? "Lead insert failed" }, { status: 500 });
    }
    leadId = (newLead as { id: string }).id;
  }

  // ── Upsert conversation ───────────────────────────────────
  const { data: existingConv } = await svc
    .from("conversations").select("id")
    .eq("org_id", params.orgId).eq("lead_id", leadId).eq("channel_provider", "manual")
    .single();

  let conversationId: string;

  if (existingConv) {
    conversationId = (existingConv as { id: string }).id;
  } else {
    const { data: newConv, error: ce } = await svc.from("conversations").insert({
      org_id:               params.orgId,
      lead_id:              leadId,
      channel_provider:     "manual",
      last_message_at:      now,
      last_message_preview: content.slice(0, 80),
    }).select("id").single();

    if (ce || !newConv) {
      return NextResponse.json({ error: ce?.message ?? "Conversation insert failed" }, { status: 500 });
    }
    conversationId = (newConv as { id: string }).id;
  }

  // ── Insert message ────────────────────────────────────────
  const { data: msg, error: me } = await svc.from("messages").insert({
    conversation_id: conversationId,
    org_id:          params.orgId,
    direction:       "inbound",
    content,
    sent_at:         now,
  }).select("id").single();

  if (me || !msg) {
    return NextResponse.json({ error: me?.message ?? "Message insert failed" }, { status: 500 });
  }

  const messageId = (msg as { id: string }).id;

  // ── Update conversation preview ────────────────────────────
  await svc.from("conversations").update({
    last_message_at:      now,
    last_message_preview: content.slice(0, 80),
  }).eq("id", conversationId);

  // ── Emit Inngest event ─────────────────────────────────────
  await inngest.send({
    name: "dm.received",
    data: { orgId: params.orgId, leadId, conversationId, messageId },
  });

  return NextResponse.json({ conversationId, leadId, messageId });
});
