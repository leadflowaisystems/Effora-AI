# CoachOS — Environment Setup

## Required environment variables

Copy `.env.example` to `.env.local` and fill in the values below.

### Core (required to boot)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `ENCRYPTION_KEY` | 64-char hex string. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NEXT_PUBLIC_APP_URL` | Full URL e.g. `https://coachos-pi.vercel.app` |

### AI (required for AI features)

| Variable | Description |
|----------|-------------|
| `LLM_API_KEY` | Groq API key (`gsk_...`) — free at console.groq.com |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` |
| `LLM_MODEL_FAST` | `llama-3.1-8b-instant` |
| `LLM_MODEL_SMART` | `llama-3.3-70b-versatile` |

### Billing (required for subscriptions)

| Variable | Description |
|----------|-------------|
| `PLATFORM_RAZORPAY_KEY_ID` | Razorpay platform key ID |
| `PLATFORM_RAZORPAY_KEY_SECRET` | Razorpay platform key secret |
| `PLATFORM_RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook HMAC secret |
| `PLATFORM_PLAN_STARTER_ID` | Razorpay plan ID for Starter |
| `PLATFORM_PLAN_GROWTH_ID` | Razorpay plan ID for Growth |
| `PLATFORM_PLAN_PRO_ID` | Razorpay plan ID for Pro |

### Integrations (optional — features work without these)

| Variable | Description |
|----------|-------------|
| `CAL_API_KEY` | Cal.com API key for webhook registration |
| `CAL_WEBHOOK_SECRET` | Cal.com webhook signing secret |
| `RAZORPAY_KEY_ID` | Per-org Razorpay key (set via UI, stored encrypted) |
| `RAZORPAY_KEY_SECRET` | Per-org Razorpay secret |

### Upstash (recommended at 50+ active orgs)

**Free tier: 10k commands/day — plenty for early scale.**

1. Sign up at [upstash.com](https://upstash.com)
2. Create a Redis database (choose nearest region)
3. Copy the REST URL and token from the dashboard

| Variable | Description |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Your Upstash REST token |

Without these, `lib/cache.ts` and `lib/ratelimit.ts` silently fall back to in-process
in-memory stores (fine for single-instance dev and early prod).

### Database connection pooler (optional, recommended for 100+ orgs)

Get the pooler URL from: Supabase Dashboard → Database → Connection Pooling →
Transaction mode (port 6543).

| Variable | Description |
|----------|-------------|
| `SUPABASE_DB_POOL_URL` | Pooler URL, e.g. `postgresql://postgres:...@db.xxx.supabase.co:6543/postgres` |

### Admin

| Variable | Description |
|----------|-------------|
| `ADMIN_EMAILS` | Comma-separated list of admin email addresses |

---

## Running locally

```bash
cp .env.example .env.local   # Fill in the values above
npm install
npm run dev
```

Navigate to `http://localhost:3000`. Supabase local stack optional (remote DB fine for dev).

## Running Inngest functions locally

```bash
# Terminal 1
npm run dev

# Terminal 2 — start the Inngest dev server
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Visit `http://localhost:8288` to see the Inngest dashboard and trigger functions manually.

## Running tests

```bash
# Access state unit tests (no DB required)
npx ts-node --project tsconfig.json scripts/access-test.ts

# RLS isolation test (requires two test users, see script header)
RLS_USER_B_EMAIL=... npx ts-node --project tsconfig.json scripts/rls-test.ts

# Load test against a running instance
node scripts/load-test.mjs https://your-deployment.vercel.app
```
