/**
 * ManyChat channel — STUB.
 *
 * Per-org API key stored encrypted in integrations table
 * (provider = 'manychat', config.api_key_enc).
 *
 * Real implementation will call ManyChat's Flow API to:
 *   - Subscribe to new DM webhooks
 *   - Read subscriber messages
 *   - Send templated replies
 *
 * Until `isLive` is set to true, the UI shows a "Coming soon" badge
 * and the activation flow is blocked.
 */

import type { ChannelProvider, ChannelMessage, SendMessageArgs } from "../types";

export const manychatProvider: ChannelProvider = {
  id: "manychat",
  name: "ManyChat",
  description:
    "Connect your ManyChat account to automate Instagram DMs at scale. Requires a ManyChat Pro account with API access.",
  logoInitials: "MC",
  requiresSetup: true,
  isLive: false, // flip to true when API integration is built

  validateConfig(config) {
    if (!config.api_key_enc || typeof config.api_key_enc !== "string") {
      return "ManyChat API key is required.";
    }
    return null;
  },

  async fetchInbound(_orgId, _config): Promise<ChannelMessage[]> {
    // STUB — will call ManyChat Subscribers API
    throw new Error("ManyChat integration is not yet live.");
  },

  async send(_orgId, _config, _args: SendMessageArgs): Promise<void> {
    // STUB — will call ManyChat Send Flow API
    throw new Error("ManyChat integration is not yet live.");
  },
};
