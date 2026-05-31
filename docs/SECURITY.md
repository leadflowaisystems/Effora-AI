# CoachOS Security Posture

## Authentication
- **Supabase Auth** — all user sessions managed via Supabase Auth (JWT, auto-refresh).
- **Google OAuth** — one-click sign-in via Supabase OAuth integration.
- **Magic link** — passwordless email login via Brevo SMTP relay; links expire in 1 hour.
- **Session cookies** — HttpOnly, Secure, SameSite=Lax via `@supabase/ssr`.

## Authorization
- **Row-Level Security (RLS)** enabled on all tables.
- `is_org_member(org_id)` and `is_org_owner(org_id)` are `SECURITY DEFINER` functions used in all RLS policies to prevent privilege escalation.
- Service-role client (`SUPABASE_SERVICE_ROLE_KEY`) is used only in API routes — never exposed to the browser.

## Encryption
- **In transit**: TLS 1.3 enforced; HSTS `max-age=63072000; includeSubDomains; preload`.
- **At rest**: Integration credentials (Razorpay key_secret, Cal.com api_key, ManyChat api_key) are AES-256-GCM encrypted before persisting via `lib/crypto.ts`. Plaintext never touches the database.
- `ENCRYPTION_KEY` is a 32-byte hex secret set per deployment via environment variable.

## Input Handling
- **Zod validation** on all API route bodies.
- **DOMPurify (isomorphic-dompurify)** sanitization in `lib/sanitize.ts` — strips all HTML/script tags from user-supplied text before DB insert.
- **Prompt injection mitigation**: user-supplied content is delimited in AI prompts using `<user_input>` XML tags so the LLM treats it as data, not instructions.

## Rate Limiting
- **Upstash Redis sliding window** (`lib/ratelimit.ts`) on auth, simulate, waitlist, and LLM endpoints.
- In-memory fallback when `UPSTASH_REDIS_REST_URL` is not set (development).

## Content Security Policy
```
default-src 'self';
script-src 'self' 'unsafe-inline' https://checkout.razorpay.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://*.supabase.co;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com https://api.inngest.com https://api.razorpay.com https://api.brevo.com https://*.upstash.io https://smtp-relay.brevo.com;
font-src 'self' data:;
frame-src https://api.razorpay.com;
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
```

## Webhook Verification
- **Cal.com**: HMAC-SHA256 signature verified on every webhook event.
- **Razorpay (coach payments)**: HMAC-SHA256 via `RAZORPAY_WEBHOOK_SECRET`.
- **Razorpay (platform billing)**: HMAC-SHA256 via `PLATFORM_RAZORPAY_WEBHOOK_SECRET`.
- **ManyChat**: Free trigger model — no inbound webhooks, no secrets needed.

## Dependency Scanning
- `npm audit` runs on every CI push.
- Dependabot configured for weekly npm dependency updates.

## Audit Logging
- `audit_log` table records sensitive actions: `user.login`, `user.logout`, `voice.update`, `integration.update`, `subscription.upgrade`, `billing.subscribe_initiated`.
- Secrets are **never** logged — only provider names and changed field names.

## Incident Response
Security issues: contact **0mnaarkar2673@gmail.com** with subject `[SECURITY] CoachOS`.
A public summary is available at `/security`.
