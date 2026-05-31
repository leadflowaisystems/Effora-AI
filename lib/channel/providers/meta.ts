/**
 * Meta (Instagram Graph API) channel provider.
 *
 * Inbound messages arrive via webhook — see /api/webhooks/meta/instagram.
 * Outbound messages call sendInstagramMessage from lib/integrations/meta-instagram.
 */

import type { ChannelProvider, ChannelMessage, SendMessageArgs } from "../types";
import { sendInstagramMessage } from "@/lib/integrations/meta-instagram";

export const metaProvider: ChannelProvider = {
  id: "meta",
  name: "Meta (Instagram API)",
  description:
    "Connect directly via the official Instagram Business API. Requires a verified Meta App and Instagram Business account.",
  logoInitials: "IG",
  requiresSetup: true,
  isLive: true,

  validateConfig(config) {
    if (!config.access_token_enc || typeof config.access_token_enc !== "string") {
      return "Instagram access token is missing — reconnect your account.";
    }
    if (!config.page_id || typeof config.page_id !== "string") {
      return "Instagram page ID is missing — reconnect your account.";
    }
    return null;
  },

  async fetchInbound(_orgId, _config): Promise<ChannelMessage[]> {
    // Inbound messages are pushed via webhook, not polled.
    return [];
  },

  async send(orgId, _config, args: SendMessageArgs): Promise<void> {
    // args.recipientHandle is the Instagram user ID of the lead
    if (!args.recipientHandle) throw new Error("recipientHandle (Instagram user ID) is required");
    await sendInstagramMessage(orgId, args.recipientHandle, args.text);
  },
};
