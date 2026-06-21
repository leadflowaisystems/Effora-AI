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
  const svc = createServiceClient();
  const { data, error: dbErr } = await svc
    .from("integrations")
    .select("config, active")
    .eq("org_id", orgId)
    .eq("provider", "razorpay")
    .single();

  if (dbErr) {
    console.error(`[razorpay] getRazorpayConfig DB error for org ${orgId}:`, dbErr.message);
    return null;
  }
  if (!data?.active) {
    console.warn(`[razorpay] getRazorpayConfig: no active Razorpay integration for org ${orgId}`);
    return null;
  }

  const config = (data.config as Record<string, unknown>) ?? {};
  const keyId  = (config.key_id as string | undefined) ?? "";
  if (!keyId) {
    console.warn(`[razorpay] getRazorpayConfig: key_id missing for org ${orgId}`);
    return null;
  }

  let keySecret = "";
  const enc = config.key_secret_enc as string | undefined;
  if (enc && isEncrypted(enc)) {
    try {
      keySecret = decryptSecret(enc);
    } catch (decErr) {
      console.error(
        `[razorpay] getRazorpayConfig: failed to decrypt key_secret_enc for org ${orgId}. ` +
        `Check that ENCRYPTION_KEY on Vercel matches the key used when credentials were saved.`,
        decErr,
      );
      return null;
    }
  } else {
    keySecret = (config.key_secret as string | undefined) ?? "";
  }

  if (!keySecret) {
    console.warn(`[razorpay] getRazorpayConfig: key_secret missing or empty for org ${orgId}`);
    return null;
  }

  return { keyId, keySecret };
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

export interface PaymentLinkError {
  httpStatus:  number;
  razorpayCode: string | null;  // e.g. "RATE_LIMIT_EXCEEDED", "BAD_REQUEST_ERROR"
  description:  string;          // human-readable from Razorpay
  isRateLimit:  boolean;
  isTestMode:   boolean;         // true when test-mode quota is the cause
}

export type CreatePaymentLinkResult =
  | { ok: true;  data: PaymentLinkResult }
  | { ok: false; error: PaymentLinkError; configMissing?: boolean };

export async function createPaymentLink(
  params: CreatePaymentLinkParams
): Promise<CreatePaymentLinkResult> {
  const config = await getRazorpayConfig(params.orgId);
  if (!config) {
    console.error(`[razorpay] createPaymentLink: no valid config for org ${params.orgId} — credentials missing or unreadable`);
    return {
      ok: false,
      configMissing: true,
      error: {
        httpStatus:   0,
        razorpayCode: null,
        description:  "Razorpay credentials are missing or could not be decrypted. Re-save your API keys in Settings › Payments.",
        isRateLimit:  false,
        isTestMode:   false,
      },
    };
  }

  const isTestKey = config.keyId.startsWith("rzp_test_");
  const auth      = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");

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
    const errBody = await res.json().catch(() => ({})) as {
      error?: { code?: string; description?: string; reason?: string };
    };
    const rzpCode   = errBody?.error?.code ?? null;
    const rzpDesc   = errBody?.error?.description ?? errBody?.error?.reason ?? `HTTP ${res.status}`;
    const isRL      = res.status === 429 || rzpCode === "RATE_LIMIT_EXCEEDED";
    const isTestMode = isRL && isTestKey;

    console.error(
      `[razorpay] createPaymentLink API error for org ${params.orgId} — HTTP ${res.status} code=${rzpCode ?? "?"}: ${rzpDesc}`,
    );

    return {
      ok: false,
      error: {
        httpStatus:   res.status,
        razorpayCode: rzpCode,
        description:  rzpDesc,
        isRateLimit:  isRL,
        isTestMode,
      },
    };
  }

  const data = await res.json();
  return { ok: true, data: { id: data.id as string, shortUrl: data.short_url as string } };
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
