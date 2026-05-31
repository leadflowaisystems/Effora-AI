/**
 * Thin cache layer — Upstash Redis when configured, in-process Map otherwise.
 *
 * Usage:
 *   const cached = await cache.get<AccessState>(`access:${orgId}`);
 *   if (!cached) {
 *     const fresh = await getAccessState(orgId);
 *     await cache.set(`access:${orgId}`, fresh, 60);
 *     return fresh;
 *   }
 *   return cached;
 *
 * Key conventions:
 *   access:<orgId>         → AccessState (60 s TTL)
 *   dashboard:<orgId>:<d>  → DashboardData (30 s TTL)
 *   voice:<orgId>          → voice profile (120 s TTL)
 *
 * Quota: 50 orgs × 200 page loads/day ÷ 60 s cache window ≈ 3k commands/day.
 * Well under the 10k free-tier limit.
 */

/* ── In-process fallback ─────────────────────────────────────── */
interface Entry { value: string; expiresAt: number }
const memStore = new Map<string, Entry>();

function memGet<T>(key: string): T | null {
  const e = memStore.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { memStore.delete(key); return null; }
  try { return JSON.parse(e.value) as T; } catch { return null; }
}

function memSet(key: string, value: unknown, ttlSeconds: number) {
  memStore.set(key, {
    value:     JSON.stringify(value),
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/* ── Upstash lazy-init ───────────────────────────────────────── */
let _redis: { get: (k: string) => Promise<string | null>; set: (k: string, v: string, opts: { ex: number }) => Promise<unknown> } | null = null;

async function getRedis() {
  if (_redis !== null) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { _redis = undefined as never; return null; }
  try {
    const { Redis } = await import("@upstash/redis");
    const r = new Redis({ url, token });
    _redis = {
      get: (k) => r.get<string>(k),
      set: (k, v, opts) => r.set(k, v, { ex: opts.ex }),
    };
    return _redis;
  } catch {
    _redis = undefined as never;
    return null;
  }
}

/* ── Public API ──────────────────────────────────────────────── */

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const redis = await getRedis();
    if (redis) {
      try {
        const raw = await redis.get(key);
        if (raw) return JSON.parse(raw) as T;
        return null;
      } catch {
        /* fall through to in-memory on error */
      }
    }
    return memGet<T>(key);
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const redis = await getRedis();
    if (redis) {
      try {
        await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
        return;
      } catch {
        /* fall through */
      }
    }
    memSet(key, value, ttlSeconds);
  },

  async del(key: string): Promise<void> {
    memStore.delete(key);
    const redis = await getRedis();
    if (redis) {
      try {
        // @upstash/redis del
        const { Redis } = await import("@upstash/redis");
        const url   = process.env.UPSTASH_REDIS_REST_URL!;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
        const r = new Redis({ url, token });
        await r.del(key);
      } catch { /* non-fatal */ }
    }
  },
};
