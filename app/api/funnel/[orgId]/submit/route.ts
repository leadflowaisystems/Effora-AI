/**
 * POST /api/funnel/[orgId]/submit
 * Public — no auth. Creates lead + conversation + fires dm.received.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { rateLimit, getIp } from "@/lib/ratelimit";
import { z } from "zod";
import { sanitizeText } from "@/lib/sanitize";

interface Params { params: { orgId: string } }

const SubmitSchema = z.object({
  name:   z.string().min(1).max(100),
  handle: z.string().min(1).max(60),
  email:  z.string().email().optional().or(z.literal("")),
  goal:   z.string().min(5).max(500),
  source: z.string().max(50).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { allowed } = rateLimit(`funnel-submit:${getIp(req)}`, { limit: 10, windowMs: 60000 });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const raw = await req.json().catch(() => ({}));
  const parsed = SubmitSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues?.[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const name   = sanitizeText(parsed.data.name);
  const handle = sanitizeText(parsed.data.handle);
  const goal   = sanitizeText(parsed.data.goal);
  const source = parsed.data.source;
  const email  = parsed.data.email;
  const orgId = params.orgId;
  const svc   = createServiceClient();
  const now   = new Date().toISOString();

  // Upsert lead
  const externalId = handle.replace(/^@/, "").toLowerCase();
  const { data: existingLead } = await svc
    .from("leads").select("id")
    .eq("org_id", orgId).eq("channel", "funnel_page").eq("external_id", externalId)
    .maybeSingle();

  let leadId: string;
  if (existingLead) {
    leadId = (existingLead as { id: string }).id;
    await svc.from("leads").update({ name, last_seen_at: now, updated_at: now }).eq("id", leadId);
  } else {
    const { data: newLead, error: le } = await svc.from("leads").insert({
      org_id:      orgId,
      channel:     "funnel_page",
      external_id: externalId,
      name,
      stage:       "cold",
      score:       0,
      source:      source ?? "funnel_page",
      last_seen_at: now,
      updated_at:  now,
      metadata:    email ? { email } : {},
    }).select("id").single();
    if (le || !newLead) return NextResponse.json({ error: "Lead creation failed" }, { status: 500 });
    leadId = (newLead as { id: string }).id;
  }

  // Upsert conversation
  const { data: existingConv } = await svc
    .from("conversations").select("id")
    .eq("org_id", orgId).eq("lead_id", leadId).eq("channel_provider", "funnel_page")
    .maybeSingle();

  let conversationId: string;
  if (existingConv) {
    conversationId = (existingConv as { id: string }).id;
  } else {
    const { data: newConv, error: ce } = await svc.from("conversations").insert({
      org_id:               orgId,
      lead_id:              leadId,
      channel_provider:     "funnel_page",
      last_message_at:      now,
      last_message_preview: goal.slice(0, 80),
    }).select("id").single();
    if (ce || !newConv) return NextResponse.json({ error: "Conversation creation failed" }, { status: 500 });
    conversationId = (newConv as { id: string }).id;
  }

  // Insert inbound message
  const { data: msg, error: me } = await svc.from("messages").insert({
    conversation_id: conversationId,
    org_id:          orgId,
    direction:       "inbound",
    content:         goal,
    sent_at:         now,
    metadata:        { source: "funnel_page", raw_name: name, raw_handle: handle },
  }).select("id").single();

  if (me || !msg) return NextResponse.json({ error: "Message creation failed" }, { status: 500 });

  // Update conversation preview
  await svc.from("conversations").update({
    last_message_at:      now,
    last_message_preview: goal.slice(0, 80),
  }).eq("id", conversationId);

  // Fire dm.received → qualifyLead + draftReply pipeline
  await inngest.send({
    name: "dm.received",
    data: { orgId, leadId, conversationId, messageId: (msg as { id: string }).id },
  });

  return NextResponse.json({ ok: true, conversationId });
}
