/**
 * POST /api/meta/deauthorize
 *
 * Meta Deauthorize Callback. Meta calls this server-to-server when a user
 * removes the app from their Facebook/Instagram settings. It carries the same
 * `signed_request` envelope as the data-deletion callback, but means something
 * different: the user has revoked our access, so any token we hold for them is
 * now dead and the integration must stop being treated as connected.
 *
 * Deauthorization is NOT deletion. Meta sends a separate data-deletion request
 * if the user also wants their data erased, which is handled by
 * app/api/meta/data-deletion/route.ts. This endpoint therefore disconnects the
 * integration and drops its stored tokens — it does not touch leads, messages,
 * bookings, payments or anything WhatsApp.
 *
 * Configure in the Meta App Dashboard:
 *   Settings → Basic → Deauthorize Callback URL
 *   https://www.effora.co.in/api/meta/deauthorize
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export async function POST(req: NextRequest) {
  // ── 1. Extract signed_request ─────────────────────────────────────────────
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

  // Split on the FIRST "." only — see the same note in the data-deletion route.
  const encodedSig     = signedRequest.slice(0, dotIndex);
  const encodedPayload = signedRequest.slice(dotIndex + 1);

  // ── 2. Resolve app secret (same chain as the other Meta endpoints) ────────
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
      console.error("[meta-deauthorize] failed to load platform app secret:", e);
    }
  }

  if (!appSecret) {
    console.error("[meta-deauthorize] META_APP_SECRET not configured — cannot verify signed_request");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // ── 3. Verify signature ───────────────────────────────────────────────────
  let payload: { user_id?: string; algorithm?: string };
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    return NextResponse.json({ error: "invalid payload encoding" }, { status: 400 });
  }

  if ((payload.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") {
    return NextResponse.json({ error: "unsupported algorithm" }, { status: 400 });
  }

  const expectedSig = createHmac("sha256", appSecret).update(encodedPayload).digest();
  let receivedSig: Buffer;
  try {
    receivedSig = base64UrlDecode(encodedSig);
  } catch {
    return NextResponse.json({ error: "invalid signature encoding" }, { status: 400 });
  }

  const signatureValid =
    expectedSig.length === receivedSig.length && timingSafeEqual(expectedSig, receivedSig);

  if (!signatureValid) {
    console.error("[meta-deauthorize] signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const metaUserId = payload.user_id;
  if (!metaUserId) {
    return NextResponse.json({ error: "user_id missing from payload" }, { status: 400 });
  }

  // ── 4. Disconnect the affected integration(s) ─────────────────────────────
  // The token we hold is dead the moment Meta sends this, so the correct action
  // is to mark the integration inactive and drop the stored tokens. Leaving an
  // active row would make the app keep trying to send and fail with opaque
  // Graph errors.
  //
  // Only provider="meta_instagram" rows are considered — WhatsApp Cloud
  // integrations are a separate provider with separate credentials and are
  // never touched here.
  let disconnected = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;

    const { data: rows } = await svc
      .from("integrations")
      .select("id, config")
      .eq("provider", "meta_instagram")
      .eq("active", true);

    for (const row of (rows ?? []) as { id: string; config: Record<string, unknown> }[]) {
      const cfg = row.config ?? {};
      const igId = String(cfg.instagram_business_account_id ?? "");
      const pageId = String(cfg.page_id ?? "");

      // Match on any identifier Meta might scope the deauthorization to.
      if (igId !== metaUserId && pageId !== metaUserId) continue;

      // Strip tokens; keep the non-secret identifiers so the owner can see what
      // was disconnected and reconnect without re-entering everything.
      const cleaned: Record<string, unknown> = { ...cfg };
      delete cleaned.access_token_enc;
      delete cleaned.user_access_token_enc;
      cleaned.deauthorized_at = new Date().toISOString();

      await svc.from("integrations")
        .update({ config: cleaned, active: false, updated_at: new Date().toISOString() })
        .eq("id", row.id);

      disconnected += 1;
    }
  } catch (e) {
    console.error("[meta-deauthorize] failed to disconnect integration:", e);
  }

  // Idempotent by construction: the query filters on active=true, so a repeat
  // callback finds nothing left to disconnect and reports 0.
  console.log(`[meta-deauthorize] integrations_disconnected=${disconnected}`);

  // Meta only checks for a 200. Body is for our own logs.
  return NextResponse.json({ ok: true, disconnected });
}
