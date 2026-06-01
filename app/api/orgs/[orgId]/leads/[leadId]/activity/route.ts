/**
 * GET /api/orgs/[orgId]/leads/[leadId]/activity
 * Returns a merged timeline of messages, bookings, and payments for a lead.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string; leadId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Verify lead belongs to org
  const { data: lead } = await svc.from("leads")
    .select("id, name")
    .eq("id", params.leadId)
    .eq("org_id", params.orgId)
    .single();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Fetch everything in parallel
  const [convsRes, bookingsRes, paymentsRes] = await Promise.all([
    svc.from("conversations")
       .select("id")
       .eq("org_id", params.orgId)
       .eq("lead_id", params.leadId)
       .order("created_at", { ascending: false })
       .limit(1)
       .single(),
    svc.from("bookings")
       .select("id, starts_at, ends_at, status, source, meeting_url, notes, created_at")
       .eq("org_id", params.orgId)
       .eq("lead_id", params.leadId)
       .order("created_at", { ascending: false })
       .limit(50),
    svc.from("payments")
       .select("id, amount_inr, status, payment_link_url, link_url, payment_method, notes, created_at, captured_at")
       .eq("org_id", params.orgId)
       .eq("lead_id", params.leadId)
       .order("created_at", { ascending: false })
       .limit(50),
  ]);

  // Fetch messages for the most recent conversation
  let messages: unknown[] = [];
  const convId = convsRes.data?.id;
  if (convId) {
    const { data: msgs } = await svc.from("messages")
      .select("id, direction, content, sent_at, metadata")
      .eq("conversation_id", convId)
      .order("sent_at", { ascending: true })
      .limit(100);
    messages = msgs ?? [];
  }

  return NextResponse.json({
    conversation_id: convId ?? null,
    messages,
    bookings:  bookingsRes.data  ?? [],
    payments:  paymentsRes.data  ?? [],
  });
}
