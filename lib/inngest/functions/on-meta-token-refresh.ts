/**
 * Inngest cron: on-meta-token-refresh
 *
 * Runs daily at 4 AM. Finds all meta_instagram integrations whose tokens
 * expire within 7 days and refreshes them via the Graph API.
 */

import { inngest }           from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshLongLivedToken } from "@/lib/integrations/meta-instagram";

export const onMetaTokenRefresh = inngest.createFunction(
  { id: "on-meta-token-refresh", name: "Meta: refresh expiring IG tokens", retries: 1 },
  { cron: "0 4 * * *" },
  async ({ step }) => {
    const appId     = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) return { skipped: true, reason: "Meta not configured" };

    const svc = createServiceClient();
    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: integrations } = await svc
      .from("integrations")
      .select("id, org_id, config")
      .eq("provider", "meta_instagram")
      .eq("active", true);

    const expiring = (integrations ?? []).filter((row) => {
      const cfg = row.config as Record<string, string>;
      return cfg.token_expires_at && cfg.token_expires_at < sevenDaysOut;
    });

    const results: { org_id: string; ok: boolean; error?: string }[] = [];

    for (const row of expiring) {
      await step.run(`refresh-token-${(row as { id: string }).id}`, async () => {
        try {
          const cfg         = row.config as Record<string, string>;
          const currentToken = decryptSecret(cfg.access_token_enc);

          const { access_token: newToken, expires_at: newExpiry } =
            await refreshLongLivedToken(currentToken, appId, appSecret);

          const newConfig = {
            ...cfg,
            access_token_enc:  encryptSecret(newToken),
            token_expires_at:  newExpiry,
          };

          await svc.from("integrations").update({
            config:     newConfig,
            updated_at: new Date().toISOString(),
          }).eq("id", (row as { id: string }).id);

          results.push({ org_id: row.org_id as string, ok: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[meta-token-refresh] failed for org ${row.org_id}:`, msg);
          results.push({ org_id: row.org_id as string, ok: false, error: msg });
        }
      });
    }

    return { checked: expiring.length, results };
  },
);
