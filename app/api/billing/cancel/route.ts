/**
 * POST /api/billing/cancel
 * Body: { orgId: string }
 *
 * Security: requires the authenticated user to be an OWNER of the org.
 * Previously only checked authentication — any logged-in user who knew
 * another org's UUID could cancel its subscription.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { cancelPlatformSubscription } from "@/lib/platform-billing";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api-handler";

async function handler(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgId } = await req.json().catch(() => ({}));
    if (!orgId) return NextResponse.json({ error: "Missing orgId" }, { status: 400 });

    // ── Ownership gate ────────────────────────────────────────────────────────
    // Verify the caller is an owner of this specific org — not just any
    // authenticated user. Without this, anyone knowing an org UUID could
    // cancel another org's subscription.
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "owner") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const svc = createServiceClient();
    const { data: orgRow } = await svc.from("orgs")
      .select("subscription_id, subscription_status")
      .eq("id", orgId).single();

    if (!orgRow) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const org = orgRow as { subscription_id: string | null; subscription_status: string };
    if (org.subscription_id) {
      await cancelPlatformSubscription(org.subscription_id);
    }

    await svc.from("orgs").update({
      plan:                "cancelled",
      subscription_status: "cancelled",
    }).eq("id", orgId);

    await logAudit(svc, orgId, user.id, "billing.cancelled", {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[billing/cancel] unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = withErrorHandler("billing/cancel", handler);
