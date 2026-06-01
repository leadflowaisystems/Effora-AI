/**
 * lib/push.ts — Web Push notification sender.
 *
 * Requires VAPID keys in env. Generate once with:
 *   npx web-push generate-vapid-keys
 *
 * Set in .env.local:
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_SUBJECT=mailto:your-email@domain.com
 */

import type webpush from "web-push";

export interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
  icon?: string;
}

let _webpush: typeof webpush | null = null;

async function getWebPush() {
  if (_webpush) return _webpush;
  const pubKey  = process.env.VAPID_PUBLIC_KEY;
  const privKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!pubKey || !privKey || !subject) {
    console.warn("[push] VAPID keys not configured — push notifications disabled");
    return null;
  }

  const wp = await import("web-push");
  wp.default.setVapidDetails(subject, pubKey, privKey);
  _webpush = wp.default;
  return _webpush;
}

interface Subscription {
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

export async function sendPush(sub: Subscription, payload: PushPayload): Promise<boolean> {
  const wp = await getWebPush();
  if (!wp) return false;

  try {
    await wp.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify({ ...payload, icon: payload.icon ?? "/icon-192.png" }),
      { TTL: 60 * 60 } // 1-hour TTL
    );
    return true;
  } catch (err: unknown) {
    // 410 = subscription expired; remove it
    if (typeof err === "object" && err !== null && "statusCode" in err && (err as { statusCode: number }).statusCode === 410) {
      return false; // caller should delete the subscription
    }
    console.error("[push] sendNotification error:", err);
    return false;
  }
}

/**
 * Sends a push to ALL subscribed users in an org.
 * Non-fatal — logs errors but never throws.
 */
export async function sendPushToOrg(
  orgId:   string,
  payload: PushPayload,
): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const svc = createServiceClient();

    const { data: subs } = await svc
      .from("user_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("org_id", orgId);

    if (!subs || subs.length === 0) return;

    for (const sub of subs as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
      const ok = await sendPush(sub, payload);
      if (!ok) {
        // Remove expired subscription
        await svc.from("user_push_subscriptions").delete().eq("id", sub.id);
      }
    }
  } catch (err) {
    console.error("[push] sendPushToOrg error:", err);
  }
}
