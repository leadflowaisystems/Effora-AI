/**
 * Module-level LRU cache for inbox conversation lists.
 * Survives React re-mounts within a page session so navigating away
 * and back to Inbox shows the last-known list instantly.
 *
 * TTL: 60s — stale data is shown while re-validation happens server-side.
 */

import type { InboxConversation } from "@/types/inbox";

interface CacheEntry {
  conversations: InboxConversation[];
  timestamp:     number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export function getInboxCache(orgId: string): InboxConversation[] | null {
  const entry = cache.get(orgId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) { cache.delete(orgId); return null; }
  return entry.conversations;
}

export function setInboxCache(orgId: string, conversations: InboxConversation[]): void {
  cache.set(orgId, { conversations, timestamp: Date.now() });
}
