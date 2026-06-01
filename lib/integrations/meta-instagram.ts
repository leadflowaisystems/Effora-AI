/**
 * Meta Instagram Graph API helpers.
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
  token_expires_at:              string; // ISO date string
}

export interface IgProfile {
  id:       string;
  username: string;
  name:     string;
}

// ── Token exchange ────────────────────────────────────────────────────────────

/**
 * Exchange a short-lived code for a long-lived page access token.
 * Returns the long-lived token and its expiry date.
 */
export async function exchangeCodeForLongLivedToken(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string,
): Promise<{ access_token: string; expires_at: string }> {
  // Step 1: code → short-lived user token
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
    throw new Error(`Meta short-lived token exchange failed: ${err}`);
  }
  const shortData = await shortRes.json() as { access_token: string };

  // Step 2: short-lived → long-lived (60-day) user token
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
    const err = await longRes.text();
    throw new Error(`Meta long-lived token exchange failed: ${err}`);
  }
  const longData = await longRes.json() as { access_token: string; expires_in: number };

  const expiresAt = new Date(Date.now() + longData.expires_in * 1000).toISOString();
  return { access_token: longData.access_token, expires_at: expiresAt };
}

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
 * Subscribe the page to webhook events for Instagram messages.
 */
export async function subscribePageToWebhooks(pageId: string, pageToken: string): Promise<void> {
  const res = await fetch(
    `${GRAPH}/${pageId}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscribed_fields: ["messages", "messaging_postbacks", "message_reads"],
        access_token:      pageToken,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to subscribe page to webhooks: ${err}`);
  }
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
 * Refresh a long-lived token before it expires (call within 7 days of expiry).
 * Returns the new token and its new expiry.
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
  expiresAt: string,
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
