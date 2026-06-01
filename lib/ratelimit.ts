/**
 * Rate limiting — Upstash Redis when env vars are present, in-memory fallback otherwise.
 *
 * Upstash setup (free tier — 10k commands/day, sufficient for ~100 active orgs):
 *   1. Sign up at upstash.com → create a Redis database
 *   2. Add to Vercel env vars (and .env.local for dev):
 *        UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
 *        UPSTASH_REDIS_REST_TOKEN=AXxx...
 *   3. That's it. This module auto-detects and switches to Upstash.
 *
 * See docs/SETUP.md for full guide.
 *
 * ┌────────────────────────────────────────────────────────────┐
 * │ TODO: Switch to Upstash when reaching ~50 active orgs.    │
 * │ The in-memory store resets on cold-start (non-critical    │
 * │ at low scale). See docs/SCALE.md for upgrade guide.       │
 * └────────────────────────────────────────────────────────────┘
 */

/* ── In-memory fallback ──────────────────────────────────────── */
interface Window { count: number; resetAt: number }
const store = new Map<string, Window>();

function inMemoryLimit(id: string, limit: number, windowMs: number) {
  const now      = Date.now();
  const existing = store.get(id);
  if (!existing || now > existing.resetAt) {
    store.set(id, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  existing.count++;
  return { allowed: existing.count <= limit, remaining: Math.max(0, limit - existing.count) };
}

/* ── Upstash sliding-window (lazy-initialised) ───────────────── */
let upstashLimiters: Map<string, unknown> | null = null;

function msToUpstashDuration(ms: number): string {
  if (ms < 60_000)     return `${Math.round(ms / 1_000)} s`;
  if (ms < 3_600_000)  return `${Math.round(ms / 60_000)} m`;
  return `${Math.round(ms / 3_600_000)} h`;
}

async function getUpstashLimiter(limit: number, windowMs: number) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const { Redis }     = await import("@upstash/redis");
    const { Ratelimit } = await import("@upstash/ratelimit");

    if (!upstashLimiters) upstashLimiters = new Map();

    const key = `${limit}:${windowMs}`;
    if (!upstashLimiters.has(key)) {
      const redis = new Redis({ url, token });
      upstashLimiters.set(key, new Ratelimit({
        redis,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        limiter:   Ratelimit.slidingWindow(limit, msToUpstashDuration(windowMs) as any),
        prefix:    "Effora AI:rl",
        analytics: false,
      }));
    }
    return upstashLimiters.get(key) as { limit: (id: string) => Promise<{ success: boolean; remaining: number }> };
  } catch {
    return null;
  }
}

/* ── Public API ──────────────────────────────────────────────── */

const DEFAULT_LIMIT  = 30;
const DEFAULT_WINDOW = 60_000;

/**
 * Rate limit an identifier. Async — uses Upstash when configured, falls back to in-memory.
 */
export async function rateLimitAsync(
  identifier: string,
  { limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW }: { limit?: number; windowMs?: number } = {}
): Promise<{ allowed: boolean; remaining: number }> {
  const limiter = await getUpstashLimiter(limit, windowMs);
  if (limiter) {
    try {
      const { success, remaining } = await limiter.limit(identifier);
      return { allowed: success, remaining };
    } catch {
      // Upstash hiccup — fall through to in-memory
    }
  }
  return inMemoryLimit(identifier, limit, windowMs);
}

/**
 * Synchronous in-memory rate limit. Use this only when the route can't be async.
 * Prefer rateLimitAsync() for all new routes.
 */
export function rateLimit(
  identifier: string,
  { limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW }: { limit?: number; windowMs?: number } = {}
): { allowed: boolean; remaining: number } {
  return inMemoryLimit(identifier, limit, windowMs);
}

/** Extract the real IP from Next.js request headers. */
export function getIp(req: { headers: { get: (k: string) => string | null } }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
