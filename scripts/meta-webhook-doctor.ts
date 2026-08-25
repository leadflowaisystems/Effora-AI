/**
 * scripts/meta-webhook-doctor.ts
 *
 * Diagnoses AND repairs Instagram webhook delivery entirely through the Graph
 * API. No dashboard clicking required for anything the API can do.
 *
 *   npx tsx scripts/meta-webhook-doctor.ts            # Phase 1 — read-only
 *   npx tsx scripts/meta-webhook-doctor.ts --repair   # Phase 2 — also writes
 *
 * WHAT IT NEEDS (in .env.local — these are NOT readable via `vercel env pull`,
 * which returns blanks for sensitive vars; copy them from the Vercel dashboard):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY     — to read platform_settings + integrations
 *   ENCRYPTION_KEY                — to decrypt stored page/user tokens
 *   META_APP_ID, META_APP_SECRET  — at minimum; more app secrets are discovered
 *                                   automatically from platform_settings and
 *                                   any active meta_byo rows
 *   META_WEBHOOK_VERIFY_TOKEN     — what our GET handler expects
 *
 * SECRET HANDLING: secrets are held in memory only. Nothing secret is printed,
 * logged, or written to disk. Output contains app ids, IG/page ids, usernames,
 * callback URLs, field lists and booleans only.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { decryptSecret, isEncrypted } from "../lib/crypto";

const GRAPH = "https://graph.facebook.com/v23.0";

// The webhook MUST be registered on the www host. The apex (effora.co.in)
// answers 308 Permanent Redirect, and Meta does not follow redirects on webhook
// verification or delivery — a callback registered at the apex silently never
// reaches the app and logs nothing at all.
const PROD_CALLBACK = "https://www.effora.co.in/api/webhooks/meta/instagram";

const REPAIR = process.argv.includes("--repair");

interface AppCred { source: string; appId: string; secret: string }

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ ${name} is not set in .env.local — cannot continue.`);
    process.exit(1);
  }
  return v;
}

const svc = createClient(
  need("NEXT_PUBLIC_SUPABASE_URL"),
  need("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

function decode(raw: string): string | null {
  try { return isEncrypted(raw) ? decryptSecret(raw) : raw; } catch { return null; }
}

async function graph(url: string, init?: RequestInit) {
  try {
    const res  = await fetch(url, init);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, json: { fetch_error: String(e) } };
  }
}

/** Every app whose id AND secret we hold. Secrets stay in memory. */
async function collectApps(): Promise<AppCred[]> {
  const out: AppCred[] = [];
  const seen = new Set<string>();
  const add = (source: string, appId?: string | null, secret?: string | null) => {
    if (!appId || !secret) return;
    if (seen.has(appId)) return;
    seen.add(appId);
    out.push({ source, appId, secret });
  };

  add("env", process.env.META_APP_ID, process.env.META_APP_SECRET);

  const { data: ps } = await svc.from("platform_settings")
    .select("meta_app_id, meta_app_secret_encrypted, meta_app_mode, meta_webhook_verify_token")
    .eq("id", 1).maybeSingle();
  if (ps?.meta_app_id && ps?.meta_app_secret_encrypted) {
    add("platform_settings", ps.meta_app_id, decode(ps.meta_app_secret_encrypted));
  }

  const { data: byo } = await svc.from("integrations")
    .select("org_id, config").eq("provider", "meta_byo").eq("active", true);
  for (const row of (byo ?? []) as { org_id: string; config: Record<string, string> }[]) {
    add(`meta_byo:${row.org_id}`, row.config?.app_id, decode(row.config?.app_secret_enc ?? ""));
  }

  return out;
}

async function main() {
  console.log(`\n▸ Meta webhook doctor — mode: ${REPAIR ? "REPAIR" : "read-only"}\n`);

  // ── PHASE 1.1 — which apps do we hold credentials for? ────────────────────
  const apps = await collectApps();
  if (apps.length === 0) {
    console.error("✗ No app whose id AND secret we hold. Set META_APP_ID + META_APP_SECRET.");
    process.exit(1);
  }
  console.log(`Apps with usable credentials: ${apps.length}`);
  for (const a of apps) console.log(`  · ${a.appId}  (source: ${a.source})`);

  // ── PHASE 1.2 — app-level subscriptions per app ───────────────────────────
  console.log(`\n── APP-LEVEL SUBSCRIPTIONS ──────────────────────────────────`);
  let owner: AppCred | null = null;

  for (const a of apps) {
    const appToken = `${a.appId}|${a.secret}`;
    const { status, json } = await graph(
      `${GRAPH}/${a.appId}/subscriptions?access_token=${encodeURIComponent(appToken)}`,
    );
    console.log(`\nApp ${a.appId} (${a.source}) — HTTP ${status}`);
    if (json?.error) { console.log(`  error: ${json.error.message} (code ${json.error.code})`); continue; }

    const subs = (json?.data ?? []) as {
      object: string; callback_url: string; active: boolean;
      fields: { name: string; version?: string }[];
    }[];
    if (subs.length === 0) { console.log("  (no subscriptions on this app)"); continue; }

    for (const s of subs) {
      const fields = (s.fields ?? []).map((f) => f.name).join(",");
      const apex = s.callback_url?.startsWith("https://effora.co.in");
      console.log(
        `  object=${s.object.padEnd(26)} active=${String(s.active).padEnd(5)} fields=[${fields}]`,
      );
      console.log(`    callback_url=${s.callback_url}${apex ? "   ⚠ APEX HOST — Meta will 308 and never reach the app" : ""}`);
      if (s.object === "instagram") owner = a;
    }
  }

  console.log(`\n▸ Instagram subscription owner: ${owner ? `${owner.appId} (${owner.source})` : "NONE of the apps we hold credentials for"}`);
  if (!owner) {
    console.log("  → The subscription belongs to an app whose secret we do NOT hold,");
    console.log("    or no instagram subscription exists at all. This is configuration,");
    console.log("    not code. Compare the App ID in your Meta dashboard URL against the");
    console.log("    ids listed above.");
  }

  // ── PHASE 1.3 — account-level subscription ────────────────────────────────
  console.log(`\n── ACCOUNT-LEVEL SUBSCRIPTION ───────────────────────────────`);
  const { data: igRows } = await svc.from("integrations")
    .select("org_id, config, active").eq("provider", "meta_instagram").eq("active", true);

  const igRow = (igRows ?? [])[0] as
    { org_id: string; config: Record<string, string> } | undefined;

  if (!igRow) {
    console.log("  ✗ No active meta_instagram integration row — nothing is connected.");
  } else {
    const cfg = igRow.config ?? {};
    console.log(`  org_id            = ${igRow.org_id}`);
    console.log(`  ig_account_id     = ${cfg.instagram_business_account_id ?? "(missing)"}`);
    console.log(`  ig_username       = ${cfg.ig_username ?? "(missing)"}`);
    console.log(`  page_id           = ${cfg.page_id ?? "(missing)"}`);
    console.log(`  token_expires_at  = ${cfg.token_expires_at ?? "null (system-user token — never expires)"}`);
    console.log(`  has_page_token    = ${!!cfg.access_token_enc}`);
    console.log(`  has_user_token    = ${!!cfg.user_access_token_enc}`);

    const userToken = cfg.user_access_token_enc ? decode(cfg.user_access_token_enc) : null;
    const pageToken = cfg.access_token_enc ? decode(cfg.access_token_enc) : null;

    // This codebase implements Instagram API with FACEBOOK Login (Business
    // Login + config_id; sends via /{page_id}/messages), so BOTH account-level
    // views are meaningful. Check each with the token type it accepts.
    if (cfg.instagram_business_account_id && userToken) {
      const { status, json } = await graph(
        `${GRAPH}/${cfg.instagram_business_account_id}/subscribed_apps?access_token=${encodeURIComponent(userToken)}`,
      );
      console.log(`\n  GET /{ig-id}/subscribed_apps — HTTP ${status}`);
      console.log(`    ${JSON.stringify(json).slice(0, 400)}`);
    }
    if (cfg.page_id && pageToken) {
      const { status, json } = await graph(
        `${GRAPH}/${cfg.page_id}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`,
      );
      console.log(`\n  GET /{page-id}/subscribed_apps — HTTP ${status}`);
      console.log(`    ${JSON.stringify(json).slice(0, 400)}`);
    }

    // ── PHASE 2 — repair ────────────────────────────────────────────────────
    if (REPAIR) {
      const repairApp = owner ?? apps[0];
      const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
      if (!verifyToken) {
        console.error("\n✗ META_WEBHOOK_VERIFY_TOKEN not set — cannot register the subscription.");
        process.exit(1);
      }

      console.log(`\n── REPAIR ───────────────────────────────────────────────────`);
      console.log(`Using app ${repairApp.appId} (${repairApp.source})`);
      console.log(`Callback: ${PROD_CALLBACK}`);

      // 2a. App-level subscription. This fires a LIVE GET verification at our
      // endpoint — the API equivalent of "Verify and Save".
      const appToken = `${repairApp.appId}|${repairApp.secret}`;
      const body = new URLSearchParams({
        object:         "instagram",
        callback_url:   PROD_CALLBACK,
        fields:         "messages",
        verify_token:   verifyToken,
        include_values: "true",
        access_token:   appToken,
      });
      const sub = await graph(`${GRAPH}/${repairApp.appId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      console.log(`\n  POST /{app-id}/subscriptions — HTTP ${sub.status}`);
      console.log(`    ${JSON.stringify(sub.json)}`);
      if (sub.json?.error) {
        console.log("    → If this is a verification failure, our GET handler rejected Meta's");
        console.log("      challenge: the verify_token above must match what the handler accepts");
        console.log("      (env META_WEBHOOK_VERIFY_TOKEN, platform_settings, or a meta_byo row).");
      }

      // 2b. Account-level subscription.
      if (cfg.instagram_business_account_id && userToken) {
        const u = new URL(`${GRAPH}/${cfg.instagram_business_account_id}/subscribed_apps`);
        u.searchParams.set("subscribed_fields", "messages");
        u.searchParams.set("access_token", userToken);
        const r = await graph(u.toString(), { method: "POST" });
        console.log(`\n  POST /{ig-id}/subscribed_apps — HTTP ${r.status}`);
        console.log(`    ${JSON.stringify(r.json)}`);
      } else {
        console.log("\n  ⚠ Cannot re-subscribe at account level: no user/system-user token stored.");
        console.log("    Reconnect Instagram via OAuth to populate user_access_token_enc.");
      }
    }
  }

  console.log(`\n${REPAIR ? "Repair" : "Diagnostic"} complete.\n`);
}

main().catch((e) => { console.error("\n✗ doctor failed:", e); process.exit(1); });
