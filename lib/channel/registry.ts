/**
 * Channel provider registry.
 *
 * Import `getChannelProvider` wherever you need to dispatch to the
 * correct provider based on the org's active channel.
 *
 * Adding a new provider:
 *   1. Create lib/channel/providers/<name>.ts implementing ChannelProvider
 *   2. Add it to the PROVIDERS map below
 *   3. Add the new ChannelId to types.ts
 */

import type { ChannelId, ChannelProvider } from "./types";
import { manualProvider }   from "./providers/manual";
import { manychatProvider } from "./providers/manychat";
import { metaProvider }     from "./providers/meta";

const PROVIDERS: Record<ChannelId, ChannelProvider> = {
  manual:   manualProvider,
  manychat: manychatProvider,
  meta:     metaProvider,
};

export function getChannelProvider(id: ChannelId): ChannelProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Unknown channel provider: ${id}`);
  return provider;
}

export function getAllProviders(): ChannelProvider[] {
  return Object.values(PROVIDERS);
}

export { PROVIDERS };
export type { ChannelId, ChannelProvider };
