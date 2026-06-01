/**
 * POST /api/webhooks/razorpay-billing
 *
 * Handles platform subscription lifecycle events:
 *   subscription.activated  → set plan + status=active + current_period_end
 *   subscription.charged    → extend current_period_end + reset AI counter
 *   subscription.cancelled  → plan=cancelled
 *   subscription.halted     → plan=cancelled, status=halted
 *   payment.failed          → status=past_due
 *
 * Signature verified via PLATFORM_RAZORPAY_WEBHOOK_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyPlatformWebhookSignature } from "@/lib/platform-billing";
import { logAudit } from "@/lib/audit";
import { invalidateAccessCache } from "@/lib/access";

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const sig      = req.headers.get("x-razorpay-signature") ?? "";

  if (!verifyPlatformWebhookSignature(rawBody, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const event     = payload.event as string | undefined;
  const subEntity = (payload.payload as Record<string, unknown>)?.subscription as Record<string, unknown> | undefined;
  const subObj    = subEntity?.entity as Record<string, unknown> | undefined;

  if (!subObj) return NextResponse.json({ ok: true });

  const subId  = subObj.id as string | undefined;
  const notes  = (subObj.notes as Record<string, string>) ?? {};
  const orgId  = notes.org_id ?? "";
  const plan   = (notes.plan ?? "growth") as string;

  if (!orgId) return NextResponse.json({ ok: true });

  const svc = createServiceClient();

  // current_period_end: use charge_at or current_end from subscription object
  const currentEnd = subObj.current_end
    ? new Date((subObj.current_end as number) * 1000).toISOString()
    : null;

  switch (event) {
    case "subscription.activated": {
      await svc.from("orgs").update({
        plan,
        subscription_status: "active",
        current_period_end:  currentEnd,
        monthly_ai_msg_count: 0,
        ai_msgs_reset_at:    new Date().toISOString(),
      }).eq("id", orgId);
      await logAudit(svc, orgId, null, "billing.activated", { plan, subId });
      break;
    }

    case "subscription.charged": {
      // Check if there's a referrer to credit
      const { data: orgRow } = await svc.from("orgs")
        .select("referred_by").eq("id", orgId).single();
      const referrer = (orgRow as { referred_by: string | null } | null)?.referred_by;

      if (referrer) {
        // Credit referrer: +30 days on current_period_end
        const { data: refOrg } = await svc.from("orgs")
          .select("id, current_period_end")
          .eq("referral_code", referrer).single();
        if (refOrg) {
          const ro = refOrg as { id: string; current_period_end: string | null };
          const base = ro.current_period_end ? new Date(ro.current_period_end) : new Date();
          base.setDate(base.getDate() + 30);
          await svc.from("orgs").update({ current_period_end: base.toISOString() }).eq("id", ro.id);
          await logAudit(svc, ro.id, null, "billing.referral_credit", { referred_org: orgId });
        }
        // Clear referred_by so credit is only applied once
        await svc.from("orgs").update({ referred_by: null }).eq("id", orgId);
      }

      await svc.from("orgs").update({
        subscription_status:  "active",
        current_period_end:   currentEnd,
        monthly_ai_msg_count: 0,
        ai_msgs_reset_at:     new Date().toISOString(),
      }).eq("id", orgId);
      await logAudit(svc, orgId, null, "billing.charged", { subId, plan });
      break;
    }

    case "subscription.cancelled":
    case "subscription.halted": {
      await svc.from("orgs").update({
        plan:                "cancelled",
        subscription_status: event === "subscription.halted" ? "halted" : "cancelled",
      }).eq("id", orgId);
      await logAudit(svc, orgId, null, "billing.cancelled", { subId, event });
      await logAudit(svc, orgId, null, "subscription.downgrade", { to: "cancelled", event });
      break;
    }

    case "payment.failed": {
      await svc.from("orgs").update({
        subscription_status: "past_due",
      }).eq("id", orgId);
      await logAudit(svc, orgId, null, "billing.payment_failed", { subId });
      break;
    }
  }

  // Invalidate cached access state so next request sees fresh plan
  if (orgId) await invalidateAccessCache(orgId).catch(() => {});

  return NextResponse.json({ ok: true });
}
