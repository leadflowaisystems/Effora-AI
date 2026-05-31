/** All supported channel providers. */
export type ChannelId = "manual" | "manychat" | "meta";

/** A single inbound DM (normalised from any provider). */
export interface ChannelMessage {
  externalId: string;
  senderHandle: string;
  senderName?: string;
  text: string;
  receivedAt: string; // ISO-8601
  raw?: unknown;
}

/** A send-DM request. */
export interface SendMessageArgs {
  recipientHandle: string;
  text: string;
}

/**
 * Static metadata + runtime capabilities for one channel provider.
 * Each provider module exports a const that satisfies this interface.
 */
export interface ChannelProvider {
  readonly id: ChannelId;
  readonly name: string;
  readonly description: string;
  readonly logoInitials: string; // 2-char monogram shown in UI when no logo
  /**
   * Whether this provider requires an API key / OAuth before it can function.
   * 'manual' is false — it works out of the box.
   */
  readonly requiresSetup: boolean;
  /** Set to true once the provider has a real API integration (not a stub). */
  readonly isLive: boolean;

  /**
   * Validate that the stored config has the fields needed to operate.
   * Returns null if valid, or an error message string if not.
   */
  validateConfig(config: Record<string, unknown>): string | null;

  /**
   * Fetch new inbound messages for an org (used by Inngest job).
   * For 'manual', returns [] — messages are entered directly in the app.
   */
  fetchInbound(
    orgId: string,
    config: Record<string, unknown>
  ): Promise<ChannelMessage[]>;

  /**
   * Send a message to a recipient via this channel.
   */
  send(
    orgId: string,
    config: Record<string, unknown>,
    args: SendMessageArgs
  ): Promise<void>;
}

/** Shape stored in orgs.channel_config for the active channel. */
export interface ChannelConfig {
  /** Which provider is active. */
  provider: ChannelId;
  /** Provider-specific settings (API keys etc. stored encrypted). */
  settings: Record<string, string>;
}
