/**
 * POST /api/orgs/[orgId]/conversations/[convId]/reply
 * Send a manual outbound message.
 * Body: { content: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendInstagramMessage } from "@/lib/integrations/meta-instagram";

// channel_provider values that map to Instagram (webhook writes "instagram",
// but the integration provider is "meta_instagram" — accept both)
const IG_PROVIDERS = new Set(["instagram", "meta_instagram"]);

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

  const channelProvider = (conv as { channel_provider?: string } | null)?.channel_provider ?? "";
  console.log(`[ig-send] request conv=${params.convId} channel_provider=${channelProvider}`);

  // Send via Meta Graph API if this is an Instagram conversation.
  // Accept both "instagram" (written by the webhook handler) and
  // "meta_instagram" (the integration provider value) — they are the same channel.
  if (IG_PROVIDERS.has(channelProvider)) {
    const { data: lead } = await svc
      .from("leads")
      .select("external_id")
      .eq("id", (conv as { lead_id: string }).lead_id)
      .single();

    const rawIgUserId = ((lead as { external_id: string } | null)?.external_id ?? "")
      .replace(/^ig_/, "");

    console.log(`[ig-send] token loading org=${params.orgId} recipient=${rawIgUserId || "(empty)"}`);

    if (!rawIgUserId) {
      console.error("[ig-send] graph error: could not resolve IG user ID from lead.external_id");
    } else {
      try {
        console.log(`[ig-send] graph request POST /{page_id}/messages recipient=${rawIgUserId}`);
        const result = await sendInstagramMessage(params.orgId, rawIgUserId, content);
        providerMessageId = result.provider_message_id;
        console.log(`[ig-send] graph response ok provider_message_id=${providerMessageId}`);
      } catch (sendErr) {
        console.error("[ig-send] graph error:", sendErr);
        return NextResponse.json({ error: "Failed to deliver message via Instagram" }, { status: 502 });
      }
    }
  } else {
    console.log(`[ig-send] skipping Meta delivery — channel_provider=${channelProvider} is not Instagram`);
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
