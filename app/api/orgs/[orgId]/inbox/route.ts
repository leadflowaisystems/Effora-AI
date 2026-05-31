/**
 * GET /api/orgs/[orgId]/inbox
 * Returns a paginated list of conversations with lead info, last message
 * preview, and a flag for pending AI drafts.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

export async function GET(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cursor = req.nextUrl.searchParams.get("cursor");      // ISO timestamp
  const limit  = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 100);

  const svc = createServiceClient();

  let query = svc
    .from("conversations")
    .select(`
      id,
      channel_provider,
      last_message_at,
      last_message_preview,
      lead:leads (id, name, external_id, channel, score, stage, avatar_url)
    `)
    .eq("org_id", params.orgId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit + 1); // +1 to detect if there's a next page

  if (cursor) query = query.lt("last_message_at", cursor);

  const { data: convRows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hasMore   = (convRows ?? []).length > limit;
  const rows      = hasMore ? (convRows ?? []).slice(0, limit) : (convRows ?? []);
  const nextCursor = hasMore ? rows[rows.length - 1]?.last_message_at ?? null : null;

  const convIds = rows.map((c) => c.id);

  const { data: draftRows } = convIds.length
    ? await svc.from("ai_drafts")
        .select("conversation_id")
        .in("conversation_id", convIds)
        .eq("status", "pending")
    : { data: [] };

  const draftSet = new Set((draftRows ?? []).map((d) => d.conversation_id as string));

  const conversations = rows.map((c) => ({
    ...c,
    hasPendingDraft: draftSet.has(c.id),
  }));

  return NextResponse.json({ conversations, next_cursor: nextCursor });
}
