/**
 * POST /api/billing/subscribe
 * Body: { orgId: string, plan: "starter" | "growth" | "pro" }
 *
 * Creates a Razorpay platform subscription and returns the checkout short_url.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createPlatformSubscription, PLAN_IDS } from "@/lib/platform-billing";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  // Dump plan ID env vars on every call so mismatches are immediately visible in logs
  console.log("[billing/subscribe] env check:", {
    starter: process.env.PLATFORM_PLAN_STARTER_ID ?? "(not set)",
    growth:  process.env.PLATFORM_PLAN_GROWTH_ID  ?? "(not set)",
    pro:     process.env.PLATFORM_PLAN_PRO_ID     ?? "(not set)",
  });

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { orgId, plan } = body as { orgId?: string; plan?: string };

    if (!orgId || !plan || !["starter", "growth", "pro"].includes(plan)) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }

    // Verify user is owner of this org
    const svc = createServiceClient();
    const { data: member } = await svc
      .from("org_members").select("role")
      .eq("org_id", orgId).eq("user_id", user.id).single();

    if (!member || (member as { role: string }).role !== "owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Debug plan → ID mapping (helps catch env var mismatches)
    const planId = PLAN_IDS[plan] ?? "(not set)";
    console.log(`[billing/subscribe] plan=${plan} → planId=${planId} orgId=${orgId}`);

    if (!planId || planId === "(not set)") {
      console.error(`[billing/subscribe] PLATFORM_PLAN_${plan.toUpperCase()}_ID env var is not set`);
      return NextResponse.json({ error: `Plan ID for "${plan}" is not configured` }, { status: 500 });
    }

    const result = await createPlatformSubscription(
      orgId,
      plan as "starter" | "growth" | "pro",
      user.email,
    );

    if (!result) {
      return NextResponse.json({ error: "Failed to create subscription — check Razorpay credentials" }, { status: 500 });
    }

    // Persist subscription_id pending activation
    await svc.from("orgs").update({
      subscription_id:     result.subscriptionId,
      subscription_status: "created",
    }).eq("id", orgId);

    await logAudit(svc, orgId, user.id, "billing.subscribe_initiated", { plan, planId });
    await logAudit(svc, orgId, user.id, "subscription.upgrade", { plan, previous: "trial" });

    return NextResponse.json({ shortUrl: result.shortUrl });
  } catch (err) {
    console.error("[billing/subscribe] unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
