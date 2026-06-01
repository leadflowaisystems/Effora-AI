/**
 * getMetaConfig(orgId) — returns Meta app credentials in priority order:
 *   1. Org-level BYO (provider="meta_byo" in integrations table)
 *   2. Platform-wide settings (platform_settings table, set via /admin/platform-settings)
 *   3. Process env vars META_APP_ID / META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN
 *
 * Returns null if none are configured (caller should show graceful error).
 */

import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret, isEncrypted } from "@/lib/crypto";

export interface MetaAppConfig {
  app_id:               string;
  app_secret:           string;
  webhook_verify_token: string;
  mode:                 "dev" | "live";
}

export async function getMetaConfig(orgId: string): Promise<MetaAppConfig | null> {
  const svc = createServiceClient();

  // 1. Org-level BYO override
  const { data: byoRow } = await svc
    .from("integrations")
    .select("config")
    .eq("org_id", orgId)
    .eq("provider", "meta_byo")
    .eq("active", true)
    .maybeSingle();

  if (byoRow?.config) {
    const cfg = byoRow.config as Record<string, string>;
    if (cfg.app_id && cfg.app_secret_enc) {
      return {
        app_id:               cfg.app_id,
        app_secret:           isEncrypted(cfg.app_secret_enc) ? decryptSecret(cfg.app_secret_enc) : cfg.app_secret_enc,
        webhook_verify_token: cfg.webhook_verify_token ?? process.env.META_WEBHOOK_VERIFY_TOKEN ?? "",
        mode:                 (cfg.mode as "dev" | "live") ?? "dev",
      };
    }
  }

  // 2. Platform-wide settings table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: platformRow } = await (svc as any)
    .from("platform_settings")
    .select("meta_app_id, meta_app_secret_encrypted, meta_webhook_verify_token, meta_app_mode")
    .eq("id", 1)
    .maybeSingle();

  if (platformRow?.meta_app_id && platformRow?.meta_app_secret_encrypted) {
    return {
      app_id:               platformRow.meta_app_id as string,
      app_secret:           isEncrypted(platformRow.meta_app_secret_encrypted as string)
                              ? decryptSecret(platformRow.meta_app_secret_encrypted as string)
                              : (platformRow.meta_app_secret_encrypted as string),
      webhook_verify_token: (platformRow.meta_webhook_verify_token as string) ?? process.env.META_WEBHOOK_VERIFY_TOKEN ?? "",
      mode:                 (platformRow.meta_app_mode as "dev" | "live") ?? "dev",
    };
  }

  // 3. Environment variables fallback
  const appId     = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const verifyTok = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (appId && appSecret) {
    return {
      app_id:               appId,
      app_secret:           appSecret,
      webhook_verify_token: verifyTok ?? "",
      mode:                 (process.env.META_APP_MODE as "dev" | "live") ?? "dev",
    };
  }

  return null;
}
