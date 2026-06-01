/**
 * Razorpay helpers for payment link creation and webhook verification.
 *
 * Keys are stored encrypted in the razorpay integration config.
 * Falls back gracefully when keys are absent (returns null).
 */

import { createHmac } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret, isEncrypted } from "@/lib/crypto";

interface RazorpayConfig {
  keyId:     string;
  keySecret: string;
}

// ── Config loader ────────────────────────────────────────────
export async function getRazorpayConfig(orgId: string): Promise<RazorpayConfig | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("integrations")
      .select("config, active")
      .eq("org_id", orgId)
      .eq("provider", "razorpay")
      .single();

    if (!data?.active) return null;
    const config = (data.config as Record<string, unknown>) ?? {};

    const keyId = (config.key_id as string | undefined) ?? "";

    let keySecret = "";
    const enc = config.key_secret_enc as string | undefined;
    if (enc && isEncrypted(enc)) {
      try { keySecret = decryptSecret(enc); } catch { /* fall through */ }
    } else {
      keySecret = (config.key_secret as string | undefined) ?? "";
    }

    if (!keyId || !keySecret) return null;
    return { keyId, keySecret };
  } catch {
    return null;
  }
}

// ── Payment link creation ────────────────────────────────────
export interface CreatePaymentLinkParams {
  orgId:         string;
  amountInr:     number;
  description:   string;
  customerName?: string;
  customerEmail?: string;
  referenceId?:  string;
}

export interface PaymentLinkResult {
  id:       string;
  shortUrl: string;
}

export async function createPaymentLink(
  params: CreatePaymentLinkParams
): Promise<PaymentLinkResult | null> {
  const config = await getRazorpayConfig(params.orgId);
  if (!config) return null;

  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");

  const body: Record<string, unknown> = {
    amount:      Math.round(params.amountInr * 100), // paise
    currency:    "INR",
    description: params.description,
    notify:      { sms: false, email: !!(params.customerEmail) },
  };

  if (params.referenceId)  body.reference_id = params.referenceId;
  if (params.customerName || params.customerEmail) {
    body.customer = {
      name:  params.customerName  ?? undefined,
      email: params.customerEmail ?? undefined,
    };
  }

  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[razorpay] createPaymentLink failed:", err);
    return null;
  }

  const data = await res.json();
  return { id: data.id as string, shortUrl: data.short_url as string };
}

// ── Webhook signature verification ───────────────────────────
/**
 * Razorpay signs the raw webhook body with HMAC-SHA256 using the
 * webhook secret configured in the Razorpay dashboard.
 * The signature is sent in the X-Razorpay-Signature header.
 */
export function verifyWebhookSignature(
  body:      string,
  signature: string,
  secret:    string
): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected;
}

/** Retrieve the webhook secret from the integration config. */
export async function getRazorpayWebhookSecret(orgId: string): Promise<string | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("integrations")
      .select("config")
      .eq("org_id", orgId)
      .eq("provider", "razorpay")
      .single();

    if (!data) return null;
    const config = (data.config as Record<string, unknown>) ?? {};
    const enc = config.webhook_secret_enc as string | undefined;
    if (enc && isEncrypted(enc)) {
      try { return decryptSecret(enc); } catch { /* fall through */ }
    }
    return (config.webhook_secret as string | undefined) ?? null;
  } catch {
    return null;
  }
}
