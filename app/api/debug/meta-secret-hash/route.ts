/**
 * GET /api/debug/meta-secret-hash
 *
 * Temporary PUBLIC diagnostic — NO AUTH.
 * Returns a salted SHA-256 hash of META_APP_SECRET so the exact runtime
 * secret value can be fingerprinted without being exposed.
 *
 * Cross-check: the secretHash here must match the secretHash logged by
 * [ig-webhook] hmac-diag on every incoming webhook request.
 * If they differ, two different secret values are in play.
 *
 * REMOVE immediately after debugging is complete.
 */

import { NextResponse } from "next/server";
import { createHmac }   from "crypto";
import { getMetaConfig } from "@/lib/meta-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.META_APP_SECRET ?? null;

  // Salted hash — identifies the exact value without revealing it.
  // The same salt is used in the webhook handler's hmac-diag log.
  const secretHash = raw
    ? createHmac("sha256", "diagnostic-salt").update(raw).digest("hex")
    : null;

  // Also resolve via getMetaConfig (the same path the OAuth flow uses)
  // to confirm the env-var and config-resolved values are identical.
  const metaCfg = await getMetaConfig("any").catch(() => null);
  const cfgSecretHash = metaCfg?.app_secret
    ? createHmac("sha256", "diagnostic-salt").update(metaCfg.app_secret).digest("hex")
    : null;

  // Char-code array of the raw env var — reveals invisible characters
  // (newlines = 10, carriage returns = 13, spaces = 32, zero-width = 8203, etc.)
  const charCodes = raw ? raw.split("").map((c) => c.charCodeAt(0)) : null;
  const hasInvisibleChars = charCodes
    ? charCodes.some((c) => c < 32 || c > 126)
    : null;

  return NextResponse.json({
    appId:              process.env.META_APP_ID          ?? null,
    configId:           process.env.META_CONFIG_ID       ?? null,
    secretLength:       raw?.length                      ?? null,
    secretPrefix:       raw?.slice(0, 6)                 ?? null,
    secretHash,
    cfgResolvedAppId:   metaCfg?.app_id                  ?? null,
    cfgResolvedSecretHash: cfgSecretHash,
    secretHashesMatch:  secretHash !== null && secretHash === cfgSecretHash,
    hasInvisibleChars,
    charCodes,          // full array — inspect for any value outside 33–126
  });
}
