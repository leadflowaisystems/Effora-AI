/**
 * Platform billing — Effora AI subscription management via Razorpay.
 *
 * Separate from per-org Razorpay (client payment collection).
 * Uses PLATFORM_RAZORPAY_KEY_ID / PLATFORM_RAZORPAY_KEY_SECRET env vars.
 */

import { createHmac } from "crypto";

const KEY_ID     = process.env.PLATFORM_RAZORPAY_KEY_ID     ?? "";
const KEY_SECRET = process.env.PLATFORM_RAZORPAY_KEY_SECRET ?? "";
const WEBHOOK_SECRET = process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET ?? "";

export const PLAN_IDS: Record<string, string> = {
  starter: process.env.PLATFORM_PLAN_STARTER_ID ?? "",
  growth:  process.env.PLATFORM_PLAN_GROWTH_ID  ?? "",
  pro:     process.env.PLATFORM_PLAN_PRO_ID     ?? "",
};

export const PLAN_PRICES: Record<string, number> = {
  starter: 999,
  growth:  2999,
  pro:     5999,
};

export const PLAN_NAMES: Record<string, string> = {
  starter: "Starter",
  growth:  "Growth",
  pro:     "Pro",
};

function authHeader() {
  return "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
}

export interface SubscriptionResult {
  subscriptionId: string;
  shortUrl:       string;
}

/** Create a Razorpay subscription for the given plan. Returns short_url for redirect. */
export async function createPlatformSubscription(
  orgId:           string,
  plan:            "starter" | "growth" | "pro",
  customerEmail?:  string,
  customerName?:   string,
): Promise<SubscriptionResult | null> {
  const planId = PLAN_IDS[plan];
  if (!planId || !KEY_ID) return null;

  try {
    const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  authHeader(),
      },
      body: JSON.stringify({
        plan_id:         planId,
        total_count:     120,   // 10 years max
        quantity:        1,
        notes: {
          org_id: orgId,
          plan,
        },
        notify_info: {
          notify_email: customerEmail ?? "",
        },
        ...(customerEmail ? {
          customer_notify: 1,
          addons: [],
        } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[platform-billing] createSubscription failed:", err);
      return null;
    }

    const data = await res.json();
    return {
      subscriptionId: data.id as string,
      shortUrl:       data.short_url as string,
    };
  } catch (err) {
    console.error("[platform-billing] createSubscription error:", err);
    return null;
  }
}

/** Cancel a Razorpay subscription immediately. */
export async function cancelPlatformSubscription(subscriptionId: string): Promise<boolean> {
  if (!KEY_ID) return false;
  try {
    const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  authHeader(),
      },
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Verify HMAC-SHA256 webhook signature. */
export function verifyPlatformWebhookSignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return true; // dev: allow unsigned
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  return signature === expected;
}
