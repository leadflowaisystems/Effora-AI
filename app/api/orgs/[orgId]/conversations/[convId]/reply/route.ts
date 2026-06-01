/**
 * POST /api/orgs/[orgId]/conversations/[convId]/reply
 * Send a manual outbound message.
 * Body: { content: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendInstagramMessage } from "@/lib/integrations/meta-instagram";

interface Params { params: { orgId: string; convId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { content?: string };

  if (!body.content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const content = body.content.trim();
  const now     = new Date().toISOString();
  const svc     = createServiceClient();

  // Load conversation to determine channel + lead's external_id for real delivery
  const { data: conv } = await svc
    .from("conversations")
    .select("channel_provider, lead_id")
    .eq("id", params.convId)
    .single();

  let providerMessageId: string | null = null;

  // Send via Meta Graph API if this is an Instagram conversation
  if (conv?.channel_provider === "meta_instagram") {
    const { data: lead } = await svc
      .from("leads")
      .select("external_id")
      .eq("id", (conv as { lead_id: string }).lead_id)
      .single();

    const rawIgUserId = ((lead as { external_id: string } | null)?.external_id ?? "")
      .replace(/^ig_/, "");

    if (rawIgUserId) {
      try {
        const result = await sendInstagramMessage(params.orgId, rawIgUserId, content);
        providerMessageId = result.provider_message_id;
      } catch (sendErr) {
        console.error("[reply] Meta send failed:", sendErr);
        return NextResponse.json({ error: "Failed to deliver message via Instagram" }, { status: 502 });
      }
    }
  }

  const { data: message, error } = await svc.from("messages").insert({
    conversation_id:    params.convId,
    org_id:             params.orgId,
    direction:          "outbound",
    content,
    sent_at:            now,
    provider_message_id: providerMessageId,
    metadata:           { source: "manual", sent_by: user.id },
  }).select("id, content, sent_at").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await svc.from("conversations").update({
    last_message_at:      now,
    last_message_preview: content.slice(0, 80),
  }).eq("id", params.convId);

  return NextResponse.json({ message });
}
