/**
 * Platform billing — Effora AI subscription management via Razorpay.
 *
 * Separate from per-org Razorpay (client payment collection).
 * Uses PLATFORM_RAZORPAY_KEY_ID / PLATFORM_RAZORPAY_KEY_SECRET env vars.
 */

import { createHmac, timingSafeEqual } from "crypto";

const KEY_ID     = process.env.PLATFORM_RAZORPAY_KEY_ID     ?? "";
const KEY_SECRET = process.env.PLATFORM_RAZORPAY_KEY_SECRET ?? "";

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

/**
 * Verify the HMAC-SHA256 signature on a Razorpay platform-billing webhook.
 *
 * Fail-closed. A missing PLATFORM_RAZORPAY_WEBHOOK_SECRET now rejects every
 * delivery; it previously returned true and treated the absent secret as
 * "development mode". In production that meant an env var which was never set,
 * or was later deleted or renamed, silently disabled authentication on the
 * billing webhook — and anyone who learned an org id (they appear in the public
 * coach funnel pages) could POST a forged subscription.activated and grant
 * themselves a paid plan, or replay subscription.charged to reset the AI usage
 * counter. There is no development-mode exemption here: an unsigned billing
 * event is never trusted.
 *
 * The secret is read per call rather than captured at module load, so the value
 * present in the environment when the request arrives is the one that applies.
 *
 * Comparison is constant-time. The length guard runs first because
 * timingSafeEqual throws on a length mismatch; a SHA-256 digest's length is
 * fixed and public, so returning early there leaks nothing. Neither the secret
 * nor the expected digest is ever logged or returned.
 */
export function verifyPlatformWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET ?? "";
  if (!secret) {
    console.error(
      "[platform-billing] PLATFORM_RAZORPAY_WEBHOOK_SECRET is not set — rejecting webhook. " +
      "Set it in the deployment environment; billing webhooks stay rejected until it is present.",
    );
    return false;
  }

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const received = Buffer.from(signature ?? "", "utf8");
  const computed = Buffer.from(expected, "utf8");
  if (received.length !== computed.length) return false;
  return timingSafeEqual(received, computed);
}
