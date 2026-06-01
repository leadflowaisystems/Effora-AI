/**
 * POST /api/orgs/[orgId]/inbox/draft
 * Body: { conversationId, stream?: boolean }
 *
 * Returns a streaming response when stream=true, otherwise a JSON draft.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { draftReply, draftReplyStream } from "@/lib/ai";

export const maxDuration = 30;

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { conversationId, stream: wantStream = false } = body as {
    conversationId?: string; stream?: boolean;
  };

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Load conversation + messages
  const { data: conv } = await svc.from("conversations")
    .select("lead_id").eq("id", conversationId).eq("org_id", params.orgId).single();
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: msgs } = await svc.from("messages")
    .select("direction, content, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true })
    .limit(20);

  const { data: leadRow } = await svc.from("leads")
    .select("score, stage").eq("id", (conv as { lead_id: string }).lead_id).single();

  const { data: vpRow } = await svc.from("voice_profiles")
    .select("*").eq("org_id", params.orgId).single();

  const { data: calRow } = await svc.from("integrations")
    .select("config").eq("org_id", params.orgId).eq("provider", "calcom").eq("active", true).maybeSingle();
  const calLink = (calRow?.config as Record<string, string> | null)?.booking_url ?? null;

  const messages = ((msgs ?? []) as { direction: string; content: string; sent_at: string }[]).map((m) => ({
    direction: m.direction as "inbound" | "outbound",
    content: m.content,
    sent_at: m.sent_at,
  }));

  const lead = leadRow as { score: number; stage: string } | null;

  if (wantStream) {
    const readableStream = await draftReplyStream({
      messages,
      voiceProfile: vpRow as Parameters<typeof draftReplyStream>[0]["voiceProfile"],
      score: lead?.score ?? 20,
      stage: lead?.stage ?? "cold",
      orgId: params.orgId,
      calLink,
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Non-streaming fallback
  const result = await draftReply({
    messages,
    voiceProfile: vpRow as Parameters<typeof draftReply>[0]["voiceProfile"],
    score: lead?.score ?? 20,
    stage: lead?.stage ?? "cold",
    orgId: params.orgId,
    calLink,
  });

  return NextResponse.json({ content: result.content });
}
