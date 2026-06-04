/**
 * Meta Instagram + WhatsApp Graph API helpers.
 *
 * All functions that touch the DB accept orgId and load the integration
 * row themselves so callers don't have to pass raw tokens around.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const GRAPH = "https://graph.facebook.com/v18.0";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MetaConfig {
  access_token_enc:              string;
  page_id:                       string;
  page_name:                     string;
  instagram_business_account_id: string;
  ig_username:                   string;
  token_expires_at:              string | null; // null = system-user token (never expires)
}

export interface IgProfile {
  id:       string;
  username: string;
  name:     string;
}

export interface WabaInfo {
  waba_id:          string;
  waba_name:        string;
  phone_number_id:  string;
  phone_number:     string;
}

// ── Token exchange ────────────────────────────────────────────────────────────

/**
 * Exchange OAuth authorization code for an access token.
 *
 * Facebook Login for Business returns a system-user access token directly
 * (no expires_in, never expires). Legacy OAuth returns a short-lived user
 * token that we then extend to a long-lived 60-day token.
 *
 * Both paths go through the same /oauth/access_token endpoint.
 */
export async function exchangeCodeForToken(
  code:        string,
  redirectUri: string,
  appId:       string,
  appSecret:   string,
): Promise<{ access_token: string; expires_at: string | null }> {
  // Step 1: exchange code for token
  const shortRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        client_id:     appId,
        client_secret: appSecret,
        redirect_uri:  redirectUri,
        code,
      }),
  );
  if (!shortRes.ok) {
    const err = await shortRes.text();
    throw new Error(`Meta token exchange failed: ${err}`);
  }
  const shortData = await shortRes.json() as {
    access_token: string;
    expires_in?:  number;
    token_type?:  string;
  };

  // System-user access tokens (Business Login) have no expires_in.
  // Return immediately — they never expire.
  if (!shortData.expires_in || shortData.expires_in === 0) {
    return { access_token: shortData.access_token, expires_at: null };
  }

  // Step 2 (legacy OAuth only): extend short-lived user token to long-lived (60-day).
  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type:        "fb_exchange_token",
        client_id:         appId,
        client_secret:     appSecret,
        fb_exchange_token: shortData.access_token,
      }),
  );
  if (!longRes.ok) {
    // Extension failed — use short-lived token with its original expiry
    const expiresAt = new Date(Date.now() + shortData.expires_in * 1000).toISOString();
    return { access_token: shortData.access_token, expires_at: expiresAt };
  }
  const longData = await longRes.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + longData.expires_in * 1000).toISOString();
  return { access_token: longData.access_token, expires_at: expiresAt };
}

// Keep the old export name as an alias for backward compatibility
export const exchangeCodeForLongLivedToken = exchangeCodeForToken;

/**
 * Fetch all Facebook Pages the user manages plus their linked Instagram Business Account.
 */
export async function fetchPagesWithIg(userToken: string): Promise<Array<{
  page_id:      string;
  page_name:    string;
  page_token:   string;
  ig_account_id: string;
  ig_username:  string;
}>> {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userToken}`,
  );
  if (!res.ok) throw new Error(`Failed to fetch pages: ${await res.text()}`);
  const data = await res.json() as {
    data: Array<{
      id:           string;
      name:         string;
      access_token: string;
      instagram_business_account?: { id: string; username: string };
    }>;
  };

  return (data.data ?? [])
    .filter((p) => p.instagram_business_account)
    .map((p) => ({
      page_id:       p.id,
      page_name:     p.name,
      page_token:    p.access_token,
      ig_account_id: p.instagram_business_account!.id,
      ig_username:   p.instagram_business_account!.username,
    }));
}

/**
 * Attempt to fetch the WhatsApp Business Account(s) accessible via the token.
 * Requires whatsapp_business_management permission in the Business Login config.
 * Returns null if the permission is absent or no WABA is connected.
 */
export async function fetchWABA(token: string): Promise<WabaInfo | null> {
  try {
    // For system-user tokens, /me resolves to the system user.
    // We look for WABA via the business portfolio.
    const bizRes = await fetch(
      `${GRAPH}/me/businesses?fields=whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number}}&access_token=${token}`,
    );
    if (!bizRes.ok) return null;

    const bizData = await bizRes.json() as {
      data?: Array<{
        whatsapp_business_accounts?: {
          data?: Array<{
            id:            string;
            name:          string;
            phone_numbers?: {
              data?: Array<{ id: string; display_phone_number: string }>;
            };
          }>;
        };
      }>;
    };

    for (const biz of bizData.data ?? []) {
      const wabas = biz.whatsapp_business_accounts?.data ?? [];
      for (const waba of wabas) {
        const phone = waba.phone_numbers?.data?.[0];
        if (waba.id && phone?.id) {
          return {
            waba_id:         waba.id,
            waba_name:       waba.name,
            phone_number_id: phone.id,
            phone_number:    phone.display_phone_number,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Subscribe the Instagram Business Account to receive message webhooks.
 *
 * Uses the Instagram Messaging API endpoint /{ig-user-id}/subscribed_apps
 * (NOT the Page endpoint). Passes params as URL query string — the Graph API
 * for this endpoint does NOT accept JSON body (access_token must be a query param).
 *
 * After this call, Meta delivers DM webhook events with:
 *   object: "instagram"
 *   entry[].id = igAccountId  (not the Facebook Page ID)
 */
export async function subscribeIgToWebhooks(igAccountId: string, pageToken: string): Promise<void> {
  const url = new URL(`${GRAPH}/${igAccountId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "messages");
  url.searchParams.set("access_token", pageToken);

  const res = await fetch(url.toString(), { method: "POST" });
  const body = await res.json() as { success?: boolean; error?: { message: string; code: number } };

  if (!res.ok || body.error) {
    throw new Error(
      `Failed to subscribe IG account to webhooks: ${body.error?.message ?? res.status}`,
    );
  }
  if (!body.success) {
    throw new Error(`IG webhook subscription returned non-success: ${JSON.stringify(body)}`);
  }
}

/**
 * @deprecated Use subscribeIgToWebhooks(igAccountId, pageToken) instead.
 * Kept for backward compatibility; now delegates to the IG-account endpoint.
 */
export async function subscribePageToWebhooks(pageId: string, pageToken: string): Promise<void> {
  // The page-ID endpoint creates a Messenger subscription, not an Instagram one.
  // Left here for callers that haven't migrated; prefer subscribeIgToWebhooks.
  void pageId;
  void pageToken;
  throw new Error(
    "subscribePageToWebhooks is deprecated — use subscribeIgToWebhooks(igAccountId, pageToken)",
  );
}

// ── Send message ─────────────────────────────────────────────────────────────

/**
 * Send an Instagram DM to a user via the Graph API.
 * Loads the integration row for the org to get the stored page token.
 */
export async function sendInstagramMessage(
  orgId:              string,
  recipientIgUserId:  string,
  text:               string,
): Promise<{ provider_message_id: string }> {
  const config = await loadMetaConfig(orgId);

  const res = await fetch(
    `${GRAPH}/${config.page_id}/messages?access_token=${decryptSecret(config.access_token_enc)}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientIgUserId },
        message:   { text },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta send message failed: ${err}`);
  }
  const data = await res.json() as { message_id: string };
  return { provider_message_id: data.message_id };
}

// ── Profile lookup ────────────────────────────────────────────────────────────

/**
 * Fetch an Instagram user's public profile using the page token.
 */
export async function getIgUserProfile(
  igUserId:    string,
  pageToken:   string,
): Promise<IgProfile> {
  const res = await fetch(
    `${GRAPH}/${igUserId}?fields=id,username,name&access_token=${pageToken}`,
  );
  if (!res.ok) {
    // Non-fatal — return minimal profile
    return { id: igUserId, username: igUserId, name: igUserId };
  }
  const data = await res.json() as { id: string; username?: string; name?: string };
  return {
    id:       data.id,
    username: data.username ?? igUserId,
    name:     data.name     ?? data.username ?? igUserId,
  };
}

// ── Token refresh ─────────────────────────────────────────────────────────────

/**
 * Refresh a long-lived user token before it expires (call within 7 days of expiry).
 * Not applicable to system-user tokens (they never expire).
 */
export async function refreshLongLivedToken(
  currentToken: string,
  appId:        string,
  appSecret:    string,
): Promise<{ access_token: string; expires_at: string }> {
  const res = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type:        "fb_exchange_token",
        client_id:         appId,
        client_secret:     appSecret,
        fb_exchange_token: currentToken,
      }),
  );
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return { access_token: data.access_token, expires_at: expiresAt };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function loadMetaConfig(orgId: string): Promise<MetaConfig> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("integrations")
    .select("config, active")
    .eq("org_id", orgId)
    .eq("provider", "meta_instagram")
    .single();

  if (error || !data?.active) {
    throw new Error(`No active Meta Instagram integration for org ${orgId}`);
  }
  return data.config as unknown as MetaConfig;
}

/**
 * Store (or overwrite) the Meta Instagram integration for an org.
 * Encrypts the access token before saving.
 */
export async function saveMetaIntegration(
  orgId:     string,
  pageId:    string,
  pageName:  string,
  igId:      string,
  igUser:    string,
  rawToken:  string,
  expiresAt: string | null,
): Promise<void> {
  const svc = createServiceClient();
  const config = {
    access_token_enc:              encryptSecret(rawToken),
    page_id:                       pageId,
    page_name:                     pageName,
    instagram_business_account_id: igId,
    ig_username:                   igUser,
    token_expires_at:              expiresAt,
  };

  const { data: existing } = await svc
    .from("integrations")
    .select("id")
    .eq("org_id", orgId)
    .eq("provider", "meta_instagram")
    .maybeSingle();

  if (existing) {
    await svc.from("integrations")
      .update({ config, active: true, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id);
  } else {
    await svc.from("integrations").insert({
      org_id:   orgId,
      provider: "meta_instagram",
      config,
      active:   true,
    });
  }
}

/**
 * Store (or overwrite) the Meta WhatsApp integration for an org.
 * Stores WABA ID, phone number ID, and the encrypted access token.
 */
export async function saveWhatsAppIntegration(
  orgId:    string,
  waba:     WabaInfo,
  rawToken: string,
): Promise<void> {
  const svc = createServiceClient();
  const config = {
    access_token_enc: encryptSecret(rawToken),
    waba_id:          waba.waba_id,
    waba_name:        waba.waba_name,
    phone_number_id:  waba.phone_number_id,
    phone_number:     waba.phone_number,
  };

  const { data: existing } = await svc
    .from("integrations")
    .select("id")
    .eq("org_id", orgId)
    .eq("provider", "meta_whatsapp")
    .maybeSingle();

  if (existing) {
    await svc.from("integrations")
      .update({ config, active: true, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id);
  } else {
    await svc.from("integrations").insert({
      org_id:   orgId,
      provider: "meta_whatsapp",
      config,
      active:   true,
    });
  }
}
