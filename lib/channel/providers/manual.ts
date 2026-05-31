/**
 * Manual channel — default provider.
 *
 * DMs are entered directly inside Effora AI (no external account required).
 * fetchInbound() always returns [] because messages flow in via the app UI,
 * not from an external API.  send() is a no-op: replies also live in-app.
 *
 * This is the provider that makes the whole app work end-to-end without
 * any third-party integration.
 */

import type { ChannelProvider, ChannelMessage, SendMessageArgs } from "../types";

export const manualProvider: ChannelProvider = {
  id: "manual",
  name: "Manual (In-App)",
  description:
    "Simulate and manage conversations directly inside Effora AI. No Instagram account required. Perfect for getting started.",
  logoInitials: "DM",
  requiresSetup: false,
  isLive: true,

  validateConfig(_config) {
    // Manual channel needs no config.
    return null;
  },

  async fetchInbound(_orgId, _config): Promise<ChannelMessage[]> {
    // Messages are created through the app UI — nothing to poll.
    return [];
  },

  async send(_orgId, _config, _args: SendMessageArgs): Promise<void> {
    // Sending in manual mode means persisting to conversations table,
    // which the API route handles directly. Nothing external to call.
  },
};
