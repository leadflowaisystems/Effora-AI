/**
 * POST /api/meta/data-deletion
 *
 * Meta User Data Deletion Callback (required for App Review).
 * Spec: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
 *
 * Meta calls this endpoint server-to-server with a `signed_request` field
 * whenever a user removes the app from their Facebook/Instagram settings:
 *   1. Verify the signed_request's HMAC-SHA256 signature using the app secret.
 *   2. Extract the Meta-scoped user_id from the decoded payload.
 *   3. Record the request and return a confirmation_code + status URL.
 *
 * The actual erasure happens in the durable Inngest function
 * lib/inngest/functions/on-meta-data-deletion.ts. Meta requires a fast
 * synchronous response carrying the confirmation code, so the deletion cannot
 * run inline here.
 *
 * This is separate from the informational /data-deletion page, which stays as
 * it is: Meta calls this endpoint programmatically, humans read the other one.
 *
 * Secret resolution mirrors /api/webhooks/meta/instagram (env var first, then
 * the platform_settings row) because both verify against the same Meta App.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export async function POST(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.effora.co.in";

  // ── 1. Extract signed_request from the request body ───────────────────────
  let signedRequest: string | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await req.json() as { signed_request?: string };
      signedRequest = body.signed_request ?? null;
    } else {
      const form = await req.formData();
      signedRequest = form.get("signed_request")?.toString() ?? null;
    }
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const dotIndex = signedRequest?.indexOf(".") ?? -1;
  if (!signedRequest || dotIndex === -1) {
    return NextResponse.json({ error: "missing or malformed signed_request" }, { status: 400 });
  }

  // Split on the FIRST "." only — String.split(".", 2) would instead split on
  // every "." and then truncate the array, silently dropping payload content
  // if it ever contained more than one separator.
  const encodedSig     = signedRequest.slice(0, dotIndex);
  const encodedPayload = signedRequest.slice(dotIndex + 1);

  // ── 2. Resolve app secret (same fallback chain as the Instagram webhook) ──
  let appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    try {
      const svc = createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ps } = await (svc as any)
        .from("platform_settings")
        .select("meta_app_secret_encrypted")
        .eq("id", 1)
        .maybeSingle();
      if (ps?.meta_app_secret_encrypted) {
        const { isEncrypted, decryptSecret } = await import("@/lib/crypto");
        appSecret = isEncrypted(ps.meta_app_secret_encrypted as string)
          ? decryptSecret(ps.meta_app_secret_encrypted as string)
          : (ps.meta_app_secret_encrypted as string);
      }
    } catch (e) {
      console.error("[meta-data-deletion] failed to load platform app secret:", e);
    }
  }

  if (!appSecret) {
    console.error("[meta-data-deletion] META_APP_SECRET not configured — cannot verify signed_request");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // ── 3. Decode + verify signature ───────────────────────────────────────────
  let payload: { user_id?: string; algorithm?: string };
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    return NextResponse.json({ error: "invalid payload encoding" }, { status: 400 });
  }

  if ((payload.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") {
    console.error(`[meta-data-deletion] unsupported algorithm: ${payload.algorithm}`);
    return NextResponse.json({ error: "unsupported algorithm" }, { status: 400 });
  }

  const expectedSig = createHmac("sha256", appSecret).update(encodedPayload).digest();
  let receivedSig: Buffer;
  try {
    receivedSig = base64UrlDecode(encodedSig);
  } catch {
    return NextResponse.json({ error: "invalid signature encoding" }, { status: 400 });
  }

  // timingSafeEqual throws on a length mismatch, so the length is compared
  // first. A digest's length is fixed and public, so this leaks nothing.
  const signatureValid =
    expectedSig.length === receivedSig.length && timingSafeEqual(expectedSig, receivedSig);

  if (!signatureValid) {
    console.error("[meta-data-deletion] signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const metaUserId = payload.user_id;
  if (!metaUserId) {
    return NextResponse.json({ error: "user_id missing from payload" }, { status: 400 });
  }

  // ── 4. Record the request and return the confirmation Meta requires ───────
  const confirmationCode = randomBytes(16).toString("hex");

  try {
    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (svc as any).from("meta_data_deletion_requests").insert({
      confirmation_code: confirmationCode,
      meta_user_id:      metaUserId,
      status:            "pending",
    });
    console.log(`[meta-data-deletion] request recorded code=${confirmationCode}`);

    // Hand off to Inngest for the actual erasure. The event id is derived from
    // the confirmation code, so an Inngest-side retry of the same request can
    // never start a second run.
    void inngest.send({
      id:   `meta-data-deletion-${confirmationCode}`,
      name: "meta.data_deletion_requested",
      data: { confirmationCode, metaUserId },
    }).catch((err) => console.error("[meta-data-deletion] inngest.send failed:", err));
  } catch (e) {
    console.error("[meta-data-deletion] failed to record deletion request:", e);
  }

  return NextResponse.json({
    url:               `${appUrl}/data-deletion-status?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
