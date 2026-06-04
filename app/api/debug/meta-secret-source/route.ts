/**
 * GET /api/debug/meta-secret-source
 *
 * Temporary PUBLIC diagnostic — NO AUTH.
 * Calls getMetaConfig() exactly as the OAuth callback does and returns
 * which source resolved the secret, plus prefix for comparison against
 * the webhook verifier's META_APP_SECRET env var.
 *
 * Also directly inspects platform_settings and meta_byo rows so the
 * full resolution chain is visible without guessing.
 *
 * REMOVE after root cause is confirmed.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret, isEncrypted } from "@/lib/crypto";
import { getMetaConfig } from "@/lib/meta-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const svc = createServiceClient();

  // ── 1. Inspect platform_settings row directly ──────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: psRow, error: psErr } = await (svc as any)
    .from("platform_settings")
    .select("id, meta_app_id, meta_app_secret_encrypted, meta_webhook_verify_token, meta_app_mode, updated_at")
    .eq("id", 1)
    .maybeSingle();

  const platformSettings = psErr
    ? { error: psErr.message }
    : psRow
      ? {
          exists:                      true,
          meta_app_id:                 psRow.meta_app_id ?? null,
          meta_app_secret_encrypted:   psRow.meta_app_secret_encrypted ? "SET" : "NOT SET",
          secret_is_encrypted_format:  psRow.meta_app_secret_encrypted
                                         ? isEncrypted(psRow.meta_app_secret_encrypted as string)
                                         : null,
          secret_decrypted_prefix:     (() => {
            if (!psRow.meta_app_secret_encrypted) return null;
            try {
              const val = isEncrypted(psRow.meta_app_secret_encrypted as string)
                ? decryptSecret(psRow.meta_app_secret_encrypted as string)
                : (psRow.meta_app_secret_encrypted as string);
              return val.slice(0, 6);
            } catch (e) {
              return `DECRYPT_FAILED: ${String(e)}`;
            }
          })(),
          meta_app_mode:               psRow.meta_app_mode ?? null,
          updated_at:                  psRow.updated_at ?? null,
        }
      : { exists: false };

  // ── 2. Inspect meta_byo row directly ──────────────────────────────────────
  const { data: byoRow, error: byoErr } = await svc
    .from("integrations")
    .select("id, org_id, active, config")
    .eq("provider", "meta_byo")
    .eq("active", true)
    .maybeSingle();

  const metaByo = byoErr
    ? { error: byoErr.message }
    : byoRow
      ? {
          exists:        true,
          org_id:        byoRow.org_id,
          has_app_id:    !!(byoRow.config as Record<string, string>)?.app_id,
          has_secret:    !!(byoRow.config as Record<string, string>)?.app_secret_enc,
        }
      : { exists: false };

  // ── 3. Env var state ───────────────────────────────────────────────────────
  const envVars = {
    META_APP_ID:      process.env.META_APP_ID     ?? null,
    META_APP_SECRET:  process.env.META_APP_SECRET
                        ? { length: process.env.META_APP_SECRET.length, prefix: process.env.META_APP_SECRET.slice(0, 6) }
                        : null,
  };

  // ── 4. Call getMetaConfig() — use a known org_id from the first integration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anyInt } = await (svc as any)
    .from("integrations")
    .select("org_id")
    .eq("provider", "meta_instagram")
    .eq("active", true)
    .limit(1);

  const orgId = anyInt?.[0]?.org_id ?? null;

  let getMetaConfigResult: {
    source:        string;
    app_id:        string | null;
    secret_prefix: string | null;
    secret_length: number | null;
    error?:        string;
  };

  if (!orgId) {
    getMetaConfigResult = { source: "unknown", app_id: null, secret_prefix: null, secret_length: null, error: "no active meta_instagram integration to derive orgId" };
  } else {
    try {
      const cfg = await getMetaConfig(orgId);
      if (!cfg) {
        getMetaConfigResult = { source: "null", app_id: null, secret_prefix: null, secret_length: null, error: "getMetaConfig returned null" };
      } else {
        // Determine which source won by re-running the same priority checks
        let source = "env-var";
        if (psRow?.meta_app_id && psRow?.meta_app_secret_encrypted) source = "platform_settings";
        if (byoRow?.config && (byoRow.config as Record<string, string>).app_id && (byoRow.config as Record<string, string>).app_secret_enc) source = "meta_byo";

        getMetaConfigResult = {
          source,
          app_id:        cfg.app_id,
          secret_prefix: cfg.app_secret.slice(0, 6),
          secret_length: cfg.app_secret.length,
        };
      }
    } catch (e) {
      getMetaConfigResult = { source: "error", app_id: null, secret_prefix: null, secret_length: null, error: String(e) };
    }
  }

  // ── 5. Comparison ──────────────────────────────────────────────────────────
  const webhookSecret = process.env.META_APP_SECRET ?? null;
  const match = webhookSecret && getMetaConfigResult.secret_prefix
    ? webhookSecret.slice(0, 6) === getMetaConfigResult.secret_prefix
    : null;

  return NextResponse.json({
    platform_settings:         platformSettings,
    meta_byo:                  metaByo,
    env_vars:                  envVars,
    get_meta_config:           getMetaConfigResult,
    comparison: {
      webhook_verifier_prefix: webhookSecret ? webhookSecret.slice(0, 6) : null,
      get_meta_config_prefix:  getMetaConfigResult.secret_prefix,
      prefixes_match:          match,
      verdict: match === true
        ? "SAME SECRET — divergence is elsewhere"
        : match === false
          ? "DIFFERENT SECRETS — OAuth and webhook use different app secrets"
          : "CANNOT COMPARE",
    },
  });
}
