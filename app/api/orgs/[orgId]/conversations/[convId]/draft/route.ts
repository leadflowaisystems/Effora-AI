/**
 * PATCH /api/orgs/[orgId]/conversations/[convId]/draft
 *
 * Actions:
 *   approve — send draft content as outbound message, mark draft 'approved'
 *   edit    — send editedContent as outbound message, mark draft 'edited'
 *   reject  — mark draft 'rejected', no message sent
 *
 * Body: { draftId: string; action: "approve" | "edit" | "reject"; editedContent?: string }
 * Returns: { ok: true; message?: { id, content, sent_at } }
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

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    draftId?:        string;
    action?:         "approve" | "edit" | "reject";
    editedContent?:  string;
  };

  if (!body.draftId || !body.action) {
    return NextResponse.json({ error: "draftId and action required" }, { status: 400 });
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();

  // ── Reject ────────────────────────────────────────────────
  if (body.action === "reject") {
    await svc.from("ai_drafts")
      .update({ status: "rejected", updated_at: now })
      .eq("id", body.draftId).eq("org_id", params.orgId);
    return NextResponse.json({ ok: true });
  }

  // ── Approve or Edit ────────────────────────────────────────
  const { data: draft } = await svc.from("ai_drafts")
    .select("content").eq("id", body.draftId).eq("org_id", params.orgId).single();

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const finalContent =
    body.action === "edit" && body.editedContent?.trim()
      ? body.editedContent.trim()
      : (draft as { content: string }).content;

  // Insert outbound message
  const { data: message, error: me } = await svc.from("messages").insert({
    conversation_id: params.convId,
    org_id:          params.orgId,
    direction:       "outbound",
    content:         finalContent,
    sent_at:         now,
    metadata:        { source: "ai", approved_by: user.id },
  }).select("id, content, sent_at").single();

  if (me) return NextResponse.json({ error: me.message }, { status: 500 });

  // Update conversation preview
  await svc.from("conversations").update({
    last_message_at:      now,
    last_message_preview: finalContent.slice(0, 80),
  }).eq("id", params.convId);

  // Mark draft done
  await svc.from("ai_drafts").update({
    status:         body.action === "edit" ? "edited" : "approved",
    edited_content: body.action === "edit" ? finalContent : null,
    updated_at:     now,
  }).eq("id", body.draftId).eq("org_id", params.orgId);

  return NextResponse.json({ ok: true, message });
}
