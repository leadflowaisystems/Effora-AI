# Scaling Guide — CoachOS

## Rate Limiting

### Current implementation

`lib/ratelimit.ts` uses an **in-memory sliding-window** store.

Works well for early-stage because:
- Vercel routes a single tenant's traffic to a small number of instances
- A cold-start reset is non-critical (at most one extra request gets through)
- Zero external dependencies — no latency overhead

**Default limits:**
| Endpoint | Limit |
|----------|-------|
| `POST /api/waitlist` | 5 req / IP / min |
| `POST /api/orgs/*/inbox/send` | 30 req / IP / min |
| All other rate-limited routes | 30 req / IP / min |

### When to upgrade (~50 active orgs)

Switch to **Upstash Redis** for cross-instance consistency.

**Setup (10 minutes):**

1. Sign up at [upstash.com](https://upstash.com) → create a Redis database  
   Free tier: 10 000 commands/day (~50 active orgs with headroom)

2. Add to Vercel environment variables:
   ```
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=AXxx...
   ```

3. Install packages:
   ```bash
   npm install @upstash/redis @upstash/ratelimit
   ```

4. Replace `lib/ratelimit.ts` implementation:
   ```typescript
   import { Redis } from "@upstash/redis";
   import { Ratelimit } from "@upstash/ratelimit";

   const redis = new Redis({
     url:   process.env.UPSTASH_REDIS_REST_URL!,
     token: process.env.UPSTASH_REDIS_REST_TOKEN!,
   });

   const limiterMap = new Map<number, Ratelimit>();

   function getLimiter(limit: number): Ratelimit {
     if (!limiterMap.has(limit)) {
       limiterMap.set(limit, new Ratelimit({
         redis,
         limiter: Ratelimit.slidingWindow(limit, "1 m"),
       }));
     }
     return limiterMap.get(limit)!;
   }

   export async function rateLimit(
     identifier: string,
     { limit = 30 }: { limit?: number } = {}
   ): Promise<{ allowed: boolean; remaining: number }> {
     const { success, remaining } = await getLimiter(limit).limit(identifier);
     return { allowed: success, remaining };
   }
   ```
   Note: change `rateLimit` to `async` and update all call sites to `await rateLimit(...)`.

---

## Database Connection Pooling

Supabase's connection pooler (port 6543) is used automatically by the Supabase
JS client. No changes needed until ~500 concurrent connections.

## AI Cost Control

Plan limits in `lib/plan.ts` + `assertAiNotBlocked()` in `lib/ai.ts` cap monthly
token usage per org. The AI cost dashboard at `/admin/ai-costs` shows spend per org.

Monitor: if any org exceeds ₹500/month in AI cost, investigate prompt length or
enable the `MODEL_FAST` override for non-critical paths.

## Inngest

Event bus is free up to 50k function runs/month. Upgrade to the Pro plan (~$25/mo)
when hitting that limit — it increases to 5M runs/month.
