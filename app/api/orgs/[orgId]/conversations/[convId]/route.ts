/**
 * GET /api/orgs/[orgId]/conversations/[convId]
 * Returns: { conversation, messages, pendingDraft }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  const [convRes, msgRes, draftRes] = await Promise.all([
    svc.from("conversations")
       .select(`id, channel_provider, last_message_at,
                lead:leads (id, name, external_id, channel, score, stage, avatar_url, created_at)`)
       .eq("id", params.convId).eq("org_id", params.orgId).single(),
    svc.from("messages")
       .select("id, direction, content, sent_at, metadata")
       .eq("conversation_id", params.convId).eq("org_id", params.orgId)
       .order("sent_at", { ascending: true }),
    svc.from("ai_drafts")
       .select("id, content, status, edited_content, created_at")
       .eq("conversation_id", params.convId).eq("org_id", params.orgId)
       .eq("status", "pending")
       .order("created_at", { ascending: false })
       .limit(1).maybeSingle(),
  ]);

  if (!convRes.data) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json({
    conversation: convRes.data,
    messages:     msgRes.data ?? [],
    pendingDraft: draftRes.data ?? null,
  });
}
