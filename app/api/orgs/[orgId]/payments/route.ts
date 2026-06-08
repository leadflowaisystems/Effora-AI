/**
 * GET  /api/orgs/[orgId]/payments           — list all payments with lead info
 * POST /api/orgs/[orgId]/payments           — create + send a payment link
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createPaymentLink } from "@/lib/razorpay";
import { sendChannelMessage } from "@/lib/booking";
import { inngest } from "@/lib/inngest/client";
import { withErrorHandler } from "@/lib/api-handler";

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

async function getHandler(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cursor = req.nextUrl.searchParams.get("cursor");
  const limit  = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 100);

  const svc = createServiceClient();
  let query = svc
    .from("payments")
    .select(`
      id, status, amount_inr, payment_link_id, payment_link_url,
      conversation_id, razorpay_payment_id, notes, created_at, updated_at,
      lead:leads(id, name, avatar_url, stage, channel)
    `)
    .eq("org_id", params.orgId)
    .is("deleted_at", null)               // exclude soft-deleted payments
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) {
    console.error("[payments GET] db error:", error.message);
    return NextResponse.json({ error: "Failed to load payments" }, { status: 500 });
  }

  const rows       = (data ?? []);
  const hasMore    = rows.length > limit;
  const items      = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.created_at ?? null : null;

  return NextResponse.json({ payments: items, next_cursor: nextCursor });
}

async function postHandler(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { leadId, conversationId, amountInr, description } = body as {
    leadId:          string;
    conversationId?: string | null;
    amountInr:       number;
    description?:    string;
  };

  if (!leadId)   return NextResponse.json({ error: "leadId required" },   { status: 400 });
  if (!amountInr || amountInr <= 0)
    return NextResponse.json({ error: "amountInr must be > 0" }, { status: 400 });
  // Cap at ₹50,00,000 (50 lakh) — prevents metric inflation from invalid inputs
  if (amountInr > 5_000_000)
    return NextResponse.json({ error: "amountInr cannot exceed ₹50,00,000" }, { status: 400 });

  const svc  = createServiceClient();
  const now  = new Date().toISOString();
  const orgId = params.orgId;

  // Get lead info — MUST belong to this org (prevents cross-org ID injection)
  const { data: lead } = await svc
    .from("leads").select("name").eq("id", leadId).eq("org_id", orgId).single();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const leadName = (lead as { name: string | null } | null)?.name ?? undefined;

  // Try to create a real Razorpay payment link
  const linkResult = await createPaymentLink({
    orgId,
    amountInr,
    description:   description ?? "Coaching program",
    customerName:  leadName,
    referenceId:   `Effora AI_${leadId.slice(0, 8)}_${Date.now()}`,
  });

  const paymentLinkId  = linkResult?.id       ?? null;
  const paymentLinkUrl = linkResult?.shortUrl ?? null;

  // Create payment row
  const { data: payment, error } = await svc.from("payments").insert({
    org_id:          orgId,
    lead_id:         leadId,
    conversation_id: conversationId ?? null,
    amount_inr:      amountInr,
    status:          "pending",
    payment_link_id: paymentLinkId,
    payment_link_url: paymentLinkUrl,
    updated_at:      now,
  }).select("id").single();

  if (error || !payment) {
    console.error("[payments POST] insert error:", error?.message);
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }

  const paymentId = (payment as { id: string }).id;

  // Send via active channel if we have a conversation and a link
  if (conversationId && paymentLinkUrl) {
    const msg = `Here's your payment link for ${description ?? "the program"} — ₹${amountInr.toLocaleString("en-IN")}:\n\n${paymentLinkUrl}`;
    await sendChannelMessage(conversationId, orgId, msg, "system");
  }

  // Emit payment.created to start the unpaid timeout watcher
  await inngest.send({
    name: "payment.created",
    data: { orgId, paymentId, leadId, conversationId: conversationId ?? null },
  });

  return NextResponse.json({
    ok: true,
    paymentId,
    paymentLinkUrl,
    razorpayConfigured: !!linkResult,
  });
}

export const GET  = withErrorHandler("payments",      getHandler);
export const POST = withErrorHandler("payments/post", postHandler);
