# EFFORA AI — RC-1 READ-ONLY EVIDENCE REPORT

**Session type:** strictly read-only. No source/config/deployment/DB/env changes were made.
**Commit inspected:** `8b8416c` (branch `rollback-test`).
**Only file written:** this report (`_diagnostic/REPORT.md`) — untracked, not staged.
**Note on tracking:** `_diagnostic/` is **NOT** in `.gitignore`. This file is therefore *untracked* but *not ignored*; it will appear in `git status`. It was not `git add`ed.

---

## 1. ESCALATIONS

### E1 — CRITICAL, ACTIVE: Instagram webhook currently accepts forged, unauthenticated payloads
`META_WEBHOOK_DEBUG_BYPASS_SIGNATURE` is **live in Vercel Production** (per `vercel env ls`: Production scope, created 2d ago). At [instagram/route.ts:124-138](../app/api/webhooks/meta/instagram/route.ts) an HMAC failure is logged and then **ignored**, and processing continues:

```ts
const signatureValid  = sig === expected;
const bypassSignature = process.env.META_WEBHOOK_DEBUG_BYPASS_SIGNATURE === "true";

if (!signatureValid) {
  console.error("[ig-webhook] SIGNATURE FAILED - received_sig does not match expected_sig");
  if (!bypassSignature) { /* halt */ return NextResponse.json({ ok: true }); }
  /* ...continues to process the unverified payload... */
}
```

**Exploitability:** any party who knows the public URL can POST a crafted body with `object: "instagram"` and `entry[].id` equal to a target org's `instagram_business_account_id` (or legacy `page_id`) and cause arbitrary lead, conversation, and message rows to be written into that org (service-role client, RLS bypassed), plus trigger a `dm.received` Inngest run that consumes the org's AI quota and can auto-send an outbound DM if `auto_send_replies` is on. `entry[].id` is the only "secret" and it is a low-entropy public-ish identifier. The org match is at [instagram/route.ts:183-187](../app/api/webhooks/meta/instagram/route.ts).
**Not fixed** (out of scope, and explicitly excluded by task rules).

### E2 — HIGH: Admin email endpoints authenticate by a guessable identifier in the request body
- [app/api/admin/email-diagnostic/route.ts:32-42](../app/api/admin/email-diagnostic/route.ts)
- [app/api/admin/email-test/route.ts:25-36](../app/api/admin/email-test/route.ts)

Both gate solely on a caller-supplied `body.adminEmail` being present in the `ADMIN_EMAILS` env list. **No session, no token, no signature.** The route's own docstring states this is deliberate ("no session required so curl works"). Knowing or guessing an admin's email address is sufficient to (a) send email through the project's SMTP credentials to an arbitrary `testTo`, and (b) read back configuration status. Admin email addresses are discoverable. Effective auth strength ≈ 0.

### E3 — MEDIUM: Per-org Razorpay webhook fails **open** when no secret is configured
[app/api/webhooks/razorpay/[orgId]/route.ts:27-31](../app/api/webhooks/razorpay/[orgId]/route.ts):

```ts
const webhookSecret = await getRazorpayWebhookSecret(params.orgId);
if (webhookSecret && sigHeader) {          // <-- verification is CONDITIONAL
  if (!verifyWebhookSignature(rawBody, sigHeader, webhookSecret)) { return 401 }
}
```

If an org has no webhook secret stored, or the caller simply omits the `x-razorpay-signature` header, the guard is skipped entirely and the payload is processed. `orgId` comes from the URL. Contrast [razorpay-billing/route.ts:24-25](../app/api/webhooks/razorpay-billing/route.ts), which fails **closed**.

### E4 — INFORMATIONAL, GOOD NEWS: `E.txt` was never committed
`E.txt` exists on disk (3,869 bytes, mtime Jun 8) and is ignored at `.gitignore:56`. `git log --all --full-history -- E.txt` and `-- '*.bak'` both return **empty**, and `git ls-files --error-unmatch E.txt` errors ("did not match any file"). **No secret-bearing file is present in any branch's history.** Git-history-driven rotation is therefore **not** mandatory on this evidence. (File contents were deliberately not opened.)

---

## 2. PART A — DECISIVE EVIDENCE

### A1. Which Instagram API product family is in use?

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Instagram authorization URL host | `https://www.facebook.com/v18.0/dialog/oauth` | [meta/connect/route.ts:62](../app/api/auth/meta/connect/route.ts) |
| 2 | Instagram token-exchange endpoint | `https://graph.facebook.com/v18.0/oauth/access_token` | [meta-instagram.ts:11,57](../lib/integrations/meta-instagram.ts) |
| 3 | Graph host for IG sends / profile lookups | `https://graph.facebook.com/v18.0` (`/{page_id}/messages`, `/{ig_user_id}?fields=id,name,username`) | [meta-instagram.ts:246,300](../lib/integrations/meta-instagram.ts) |
| 4 | Scopes requested in code | **NONE.** OAuth passes `config_id` only and deliberately omits `scope` | [meta/connect/route.ts:58-67](../app/api/auth/meta/connect/route.ts) |
| 5 | Graph API version strings | **`/v18.0` only — 7 occurrences.** No `v23.0` anywhere in the tree | see below |
| 6 | Product family | **Instagram API with *Facebook* Login** (code-level) — but the effective grant is Dashboard-controlled | see conclusion |

**`graph.instagram.com`, `api.instagram.com`, `www.instagram.com/oauth`: ZERO occurrences.** Confirmed absent.

All 7 `/v18.0` sites: `lib/integrations/whatsapp-cloud.ts:9`, `lib/integrations/meta-instagram.ts:11`, `app/api/auth/meta/connect/route.ts:62`, `app/api/admin/platform-settings/route.ts:54`, `app/api/orgs/[orgId]/integrations/meta-instagram/debug-token/route.ts:19`, plus doc comments in `resubscribe/route.ts:8`.

> **Correction to prior documentation:** `INTERVIEW_AUDIT.md:54,256,278` states v23.0 is used in `app/api/webhooks/meta/instagram/route.ts`. **That is false at `8b8416c`** — the IG webhook route contains no Graph version string at all (it makes no outbound Graph calls; profile lookup is delegated to `meta-instagram.ts`, which is v18.0). The repo is uniformly v18.0.

**Scope-family evidence is MIXED — this is the H2-relevant ambiguity:**
- **Facebook-Login family** in docs: `pages_show_list`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `business_management` — [docs/META_APP_SETUP.md:71-75](../docs/META_APP_SETUP.md).
- **Instagram-Login family** referenced as acceptable: `instagram_business_basic`, `instagram_business_manage_messages` — [debug-token/route.ts:144](../app/api/orgs/[orgId]/integrations/meta-instagram/debug-token/route.ts).
- `INTERVIEW_AUDIT.md:44,153` asserts the Meta App configuration contains `instagram_business_manage_messages` and `instagram_business_manage_insights` (Instagram-Login family).

**Conclusion:** the *code* is unambiguously Facebook-Login-shaped. But because OAuth sends **`config_id` and no `scope`**, the actual product family and permission set live entirely in the Meta App Dashboard Business-Login configuration (`config_id 1303123918594190`, hardcoded in a comment at [connect/route.ts:7](../app/api/auth/meta/connect/route.ts)) and are **invisible to this repository**. Whether the app is configured as *Instagram API with Instagram Login* (which has a **separate Instagram App Secret**) cannot be determined from code. **UNKNOWN — see A9 for what settles it.**

### A2. Which secret does each webhook verification path actually use?

**Verification sites:**
- Instagram: [instagram/route.ts:108-123](../app/api/webhooks/meta/instagram/route.ts)
- WhatsApp: [whatsapp/route.ts:78-85](../app/api/webhooks/whatsapp/route.ts)

**Secret-resolution expressions — and the decisive asymmetry:**

| Path | Resolution order | Code |
|---|---|---|
| **OAuth connect + callback** (mints the token that **creates** the IG subscription) | 1. `integrations` where `provider='meta_byo'` → `config.app_id` + `config.app_secret_enc`<br>2. `platform_settings` id=1 → `meta_app_id` + `meta_app_secret_encrypted`<br>3. `process.env.META_APP_ID` / `META_APP_SECRET` | `getMetaConfig()` — [meta-config.ts:25-79](../lib/meta-config.ts) |
| **Instagram webhook** (**verifies** the signature) | 1. `process.env.META_APP_SECRET`<br>2. `platform_settings.meta_app_secret_encrypted` (only if env is falsy)<br>**never consults `meta_byo`** | [instagram/route.ts:78-100](../app/api/webhooks/meta/instagram/route.ts) |
| **WhatsApp webhook** | `process.env.META_APP_SECRET` **only** — no fallback, hard 500 if unset | [whatsapp/route.ts:72-76](../app/api/webhooks/whatsapp/route.ts) |

> ### ⭐ THE CENTRAL NEW FINDING: the DB-vs-env precedence is **INVERTED** between the two halves of the flow.
>
> `getMetaConfig()` prefers **DB → env**. The Instagram webhook prefers **env → DB**.
>
> `META_APP_SECRET` **is** confirmed present in Vercel Production (`vercel env ls`). Therefore the webhook **always** uses the **env** app's secret. Meanwhile OAuth — which mints the token that `subscribeIgToWebhooks()` uses to register the subscription — uses the **env** app **only if both DB sources are empty**.
>
> **If either `meta_byo` (any org) or `platform_settings.meta_app_id` is populated, then the subscription is owned by the DB-configured app while verification uses the env-configured app.** If those two apps differ, Instagram HMAC fails 100% of the time, permanently and silently — exactly the observed symptom. This is a complete, code-level *mechanism* for H1 and H3.
>
> **And it explains the WhatsApp asymmetry:** grep confirms there is **no `subscribed_apps` / `subscriptions` call for WhatsApp anywhere** in the repo. `fetchWABA()` only *reads* the WABA ([meta-instagram.ts:143-184](../lib/integrations/meta-instagram.ts)). The WhatsApp webhook subscription is therefore Dashboard-configured on one specific app — and WhatsApp verifies successfully, so that app is the **env** app. Instagram's subscription is the only one created **programmatically**, through the inverted-precedence path. WhatsApp working is not evidence that Instagram's app is correct; the two subscriptions are established by entirely different mechanisms.

**Other A2 answers:**
3. `getMetaConfig` is **NOT** used in either webhook path — only in `meta/connect` and `meta/callback` ([meta-config.ts](../lib/meta-config.ts) call sites confirmed: 2, both OAuth).
4. **Instagram-specific secret env vars: NONE.** `INSTAGRAM_APP_SECRET`, `IG_APP_SECRET`, `META_INSTAGRAM_APP_SECRET` — zero occurrences (case-insensitive). Exactly **one** Meta secret name exists repo-wide: `META_APP_SECRET`.
5. **Full de-duplicated `process.env.*` inventory (58 names, values never read):**
   - *Webhook paths:* `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_WEBHOOK_DEBUG_BYPASS_SIGNATURE`, `PLATFORM_RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `ENCRYPTION_KEY`, `INNGEST_EVENT_KEY`
   - *OAuth paths:* `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_APP_MODE`, `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_APP_URL`
   - *Elsewhere:* `ADMIN_EMAILS`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `BREVO_SMTP_PASS`, `BREVO_SMTP_USER`, `FOUNDER_EMAILS`, `GROQ_API_KEYS`, `INNGEST_SIGNING_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_FAST`, `LLM_MODEL_SMART`, `NEXT_PUBLIC_LLM_MODEL_SMART`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NODE_ENV`, `PLATFORM_PLAN_{GROWTH,PRO,STARTER}_ID`, `PLATFORM_RAZORPAY_KEY_{ID,SECRET}`, `RAZORPAY_KEY_{ID,SECRET}`, `REVIVAL_INACTIVE_DAYS`, `RLS_ORG_A_ID`, `RLS_ORG_B_ID`, `RLS_USER_B_EMAIL`, `RLS_USER_B_PASSWORD`, `SMTP_{FROM,HOST,PASS,PORT,USER}`, `SUPABASE_ACCESS_TOKEN`, `TEST_{DUNNING_DELAY,PAYMENT_UNPAID,REBOOK_DELAY,REMINDER_1H,REMINDER_24H,REVIVAL_DELAY}_MS`, `UPSTASH_REDIS_REST_{TOKEN,URL}`, `VAPID_{PRIVATE_KEY,PUBLIC_KEY,SUBJECT}`, `VERCEL`
6. **`timingSafeEqual` is used NOWHERE in the repo.** Both Meta webhooks use plain `===` string comparison on the hex digest (`sig === expected`). No length pre-check. This is a timing-oracle weakness in principle; it is **not** a correctness cause of the failure (`===` and `timingSafeEqual` agree on equal/unequal), so it does not discriminate between hypotheses.

### A3. Webhook route anatomy — actual differences

Seven webhook routes exist: `calcom/[orgId]`, `manychat/[orgId]`, `manychat-handoff/[orgId]`, `meta/instagram`, `razorpay/[orgId]`, `razorpay-billing`, `whatsapp`.

| Property | Instagram | WhatsApp |
|---|---|---|
| Methods | `GET`, `POST` | `GET`, `POST` |
| `export const runtime` | **`"nodejs"`** (line 26) | **ABSENT** |
| `export const dynamic` | **`"force-dynamic"`** (line 27) | **ABSENT** |
| `maxDuration` | absent | absent |
| Raw body read | `await req.text()` line 108 — **once** | `await req.text()` line 78 — **once** |
| Body re-read / re-serialized? | No. `JSON.parse(rawBody)` line 143 operates on the same string | No. `JSON.parse(rawBody)` line 89 |
| Header read | `req.headers.get("x-hub-signature-256")` (lowercase; Next normalizes) | identical, lowercase |
| Normalization/trim/encoding change before HMAC | **None** in either | **None** |
| GET handshake on same route | Yes — compares `process.env.META_WEBHOOK_VERIFY_TOKEN` (line 37) | Yes — compares `process.env.META_WEBHOOK_VERIFY_TOKEN` (line 22) |

**On failure — Instagram** (lines 126-138, quoted in E1 above): logs, and **if bypass is set, continues**; otherwise returns `200 {ok:true}` — a silent discard. Nothing is persisted on the halt path.
**On failure — WhatsApp** (lines 82-85):
```ts
if (sig !== expected) {
  console.warn("[wa-webhook] signature mismatch");
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```
Fails **closed with 401**. No bypass path exists — confirmed by grep and by the comment added in `e5731fe`: *"Does NOT affect the WhatsApp webhook, which has no bypass path."*

**Middleware DOES run on both webhook POSTs.** [middleware.ts:61-70](../middleware.ts) matcher is `/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)` — `/api/webhooks/*` matches no exclusion. Middleware sets `x-pathname` and awaits `supabase.auth.getUser()` on every webhook delivery. It does **not** read or rewrite the request body, so it is **not** a plausible HMAC-corruption vector — but it adds a Supabase round-trip to every inbound webhook (see B6). It applies **equally** to IG and WA, so it does not discriminate.

**Net:** the only material IG/WA route differences are the `runtime`/`dynamic` exports (both resolve to nodejs+dynamic for a POST handler in Next 14, so functionally equivalent) and the failure-mode/bypass asymmetry. **The prior conclusion that body/header/crypto handling is byte-identical is CONFIRMED, not merely assumed.** H4-via-route-anatomy is effectively **CONTRADICTED**.

### A4. Bypass blast radius

`META_WEBHOOK_DEBUG_BYPASS_SIGNATURE` — **exactly one functional call site**: [instagram/route.ts:124](../app/api/webhooks/meta/instagram/route.ts). Supporting references at lines 120 (comment), 129, 133 (log strings). Guarded behaviour: skips HMAC enforcement for the Instagram webhook only. Scope: Production env var, per `vercel env ls`.

**Other escape hatches found (full sweep for `BYPASS` / `SKIP_VERIF` / `DISABLE_*(VERIF|SIGN|AUTH)` / NODE_ENV gates):**
- `app/api/orgs/[orgId]/dashboard/route.ts:132` — `if (process.env.NODE_ENV !== "production")` (dev-only branch)
- `app/(app)/org/[orgSlug]/{bookings,dashboard,payments}/page.tsx` — `isDev` UI affordances only
- **No other auth, signature, or tenant-scoping bypass exists.** No `SKIP_VERIFY`, no `DISABLE_AUTH`. The E2/E3 weaknesses above are design flaws, not env-flag bypasses.

### A5. The surviving `/debug-token` endpoint — schema only (NOT called)

[app/api/orgs/[orgId]/integrations/meta-instagram/debug-token/route.ts](../app/api/orgs/[orgId]/integrations/meta-instagram/debug-token/route.ts)

**1. Auth guard — sound, `orgId` is NOT blindly trusted** (lines 56-68):
```ts
async function assertMember(orgId: string) {
  const supabase = createClient();                      // anon client + session cookie → RLS applies
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}
// GET: const user = await assertMember(params.orgId); if (!user) return 401;
```
Membership is verified against `org_members` for the session user. **No escalation.** Note it requires *any* member role, not admin/owner.

**2. Meta endpoints called:** `GET https://graph.facebook.com/v18.0/debug_token?input_token=<stored token>&access_token=<META_APP_ID>|<META_APP_SECRET>` — once per stored token (lines 42-44). The app-access token is built from **env** `META_APP_ID`/`META_APP_SECRET` (lines 70-78). No `/me`, no other calls.

**3. Exact response shape:**

| Key | Type | Label |
|---|---|---|
| `ig_username` | string | SAFE |
| `page_id` | string | SAFE (identifier) |
| `instagram_business_account_id` | string | SAFE (identifier) |
| `tokens.page_token.description` | string | SAFE |
| `tokens.page_token.expected_type` | `"PAGE"` | SAFE |
| `tokens.page_token.debug.app_id` | string | **SAFE — identifier, this is the target evidence** |
| `tokens.page_token.debug.application` | string | SAFE (app display name) |
| `tokens.page_token.debug.type` | string | SAFE |
| `tokens.page_token.debug.is_valid` | boolean | SAFE |
| `tokens.page_token.debug.expires_at` | number | SAFE |
| `tokens.page_token.debug.scopes[]` | string[] | SAFE |
| `tokens.page_token.debug.granular_scopes[]` | `{scope, target_ids[]}` | SAFE |
| `tokens.page_token.debug.user_id` | string | **REDACT** (Meta user identifier / PII-adjacent) |
| `tokens.page_token.debug.error` | `{code,message,subcode}` | SAFE |
| `tokens.page_token.debug.raw_error` | string | **REVIEW** — may echo a Graph message; redact if it contains any token substring |
| `tokens.user_token.*` | same shape | same labels |
| `question` | string | SAFE (contains IG id `17841424594812508`) |
| `answer_criteria.required_token_type` | string | SAFE |
| `answer_criteria.required_scopes[]` | string[] | SAFE |
| `answer_criteria.required_app_id` | string | **SAFE — this is env `META_APP_ID`, the comparison baseline** |

**Raw token values are never returned** — confirmed: `inspectToken` returns only `json.data`, and the decrypted token is only ever passed as a query parameter (lines 104-119).

**4. Does it identify the minting app? YES — `debug.app_id` and `answer_criteria.required_app_id` together are exactly the H1 comparison.** ⚠️ **But with a material caveat that limits it:** the `/debug_token` call authenticates with the **env** app's app-token. Meta will not return clean introspection for a token minted by a *different* app; it returns an `OAuthException` instead. So a genuine app mismatch surfaces as `raw_error` / `error.code 190` — **indistinguishable from an expired or revoked token**. The endpoint can therefore *falsify* H1 cleanly (a valid `app_id` equal to `required_app_id` ⇒ same app) but **cannot cleanly prove it** — a failure is ambiguous. **This is why the A9 recommended step is a different, unambiguous read.**

**5. Copy-paste redaction list before pasting the JSON into chat:**
```
tokens.page_token.debug.user_id
tokens.user_token.debug.user_id
tokens.*.debug.raw_error      (only if it contains a long opaque string)
```
Everything else in the response is safe to share.

### A6. How is the Instagram webhook subscription created?

**In code.** [meta-instagram.ts:207-224](../lib/integrations/meta-instagram.ts):
```ts
export async function subscribeIgToWebhooks(igAccountId: string, userToken: string): Promise<void> {
  const url = new URL(`${GRAPH}/${igAccountId}/subscribed_apps`);   // GRAPH = graph.facebook.com/v18.0
  url.searchParams.set("subscribed_fields", "messages");
  url.searchParams.set("access_token", userToken);
  const res = await fetch(url.toString(), { method: "POST" });
  ...
}
```
- **Object id:** the Instagram Business Account ID (not the Page ID). Subscribed field: `messages`.
- **Token used:** the user/system-user token from the OAuth code exchange — i.e. **whichever app `getMetaConfig()` selected** (`meta_byo` → `platform_settings` → env).
- **Two invocation points:** [meta/callback/route.ts:112](../app/api/auth/meta/callback/route.ts) (non-fatal, wrapped in try/catch — a failure here is only logged) and [resubscribe/route.ts:93](../app/api/orgs/[orgId]/integrations/meta-instagram/resubscribe/route.ts) (member-gated manual retrigger).
- `override_callback_uri`: **not used** — the callback URL is Dashboard-configured, per app.
- **No WhatsApp subscription call exists anywhere** — WhatsApp is Dashboard-only. (See the A2 asymmetry note.)

**So the app that signs Instagram webhooks = the app whose token was current at the last successful `subscribeIgToWebhooks()` call.** That is a *historical* fact about a past OAuth run and is not necessarily today's `getMetaConfig()` result.

### A7. Multi-app / BYO credential storage (H3)

**1. Per-tenant Meta app credentials ARE supported.** Storage: the existing `integrations` table with `provider = 'meta_byo'` — no dedicated table. [017_platform_settings.sql:22-23](../supabase/migrations/017_platform_settings.sql): *"meta_byo provider: integrations.provider = 'meta_byo' stores per-org Meta App override. No schema change needed."* Fields consumed: `config.app_id`, `config.app_secret_enc`, `config.webhook_verify_token`, `config.config_id`, `config.mode` ([meta-config.ts:33-43](../lib/meta-config.ts)). The secret is encrypted at rest and decrypted with `isEncrypted()`/`decryptSecret()` (AES-256-GCM via `ENCRYPTION_KEY`), with a **plaintext passthrough fallback** if `isEncrypted()` is false.

`platform_settings` schema ([017:4-20](../supabase/migrations/017_platform_settings.sql)): `id` (CHECK id=1), `meta_app_id`, `meta_app_secret_encrypted`, `meta_webhook_verify_token`, `meta_app_mode`, `last_verified_at`, `updated_at`, `updated_by`. RLS: service-role only. ⚠️ Note `getMetaConfig` reads `platformRow.meta_config_id` at [meta-config.ts:61](../lib/meta-config.ts) but that column is **not selected** at line 50 and **is not in the migration** — it is always `undefined`, so `config_id` always falls through to `process.env.META_CONFIG_ID`. Latent inconsistency, not a signature cause.

**2. The two resolution paths, side by side:**

```ts
// ── OAuth / subscription-creating path — lib/meta-config.ts:25-79 ──
// (1) meta_byo
svc.from("integrations").select("config")
   .eq("org_id", orgId).eq("provider", "meta_byo").eq("active", true)
   → { app_id: cfg.app_id, app_secret: decryptSecret(cfg.app_secret_enc) }
// (2) platform_settings
svc.from("platform_settings").select("meta_app_id, meta_app_secret_encrypted, ...").eq("id", 1)
   → { app_id: platformRow.meta_app_id, app_secret: decryptSecret(platformRow.meta_app_secret_encrypted) }
// (3) env  ← reached ONLY if (1) and (2) both empty
if (appId && appSecret) → { app_id: process.env.META_APP_ID, app_secret: process.env.META_APP_SECRET }

// ── Instagram webhook verifying path — app/api/webhooks/meta/instagram/route.ts:78-100 ──
let appSecret = process.env.META_APP_SECRET;              // (1) ENV FIRST
if (!appSecret) {                                          // (2) DB only as fallback
  const { data: ps } = await svc.from("platform_settings")
    .select("meta_app_secret_encrypted").eq("id", 1).maybeSingle();
  appSecret = isEncrypted(...) ? dec(...) : ...;
}
// meta_byo is NEVER consulted here.

// ── WhatsApp webhook verifying path — app/api/webhooks/whatsapp/route.ts:72-76 ──
const appSecret = process.env.META_APP_SECRET;             // env only, no fallback
```

**3. Verdict on H3: SUPPORTED as a mechanism, UNCONFIRMED as fact.** The code guarantees a mismatch *if* a `meta_byo` row exists for the affected org: OAuth would create the subscription under the BYO app while the webhook verifies with the env app, and `meta_byo` is structurally unreachable from the webhook. Confirming requires one row-existence check (A9). The same mechanism applies one level up via `platform_settings`, which does not even require BYO to be in use.

### A8. Narrow git archaeology

**1. Bypass introduction — two commits:**

| Commit | Date | Message | Stat |
|---|---|---|---|
| `f5ddc38` | Fri Jun 5 2026 | `debug: add META_WEBHOOK_DEBUG_BYPASS_SIGNATURE + step-level pipeline tracing` | `app/api/webhooks/meta/instagram/route.ts` only, +69/−29 |
| `e5731fe` | Tue Jul 14 2026 | `debug: allow META_WEBHOOK_DEBUG_BYPASS_SIGNATURE in production for Instagram webhook diagnosis` | `app/api/webhooks/meta/instagram/route.ts` only, +7/−12 |

Both are single-file commits touching only the IG webhook.

**2. Did Instagram signature verification ever work without the bypass? Evidence says NO — and there is a clean natural experiment.** The `e5731fe` diff shows the pre-existing guard was **NODE_ENV-gated**:
```diff
-  const bypassSignature =
-    process.env.NODE_ENV !== "production" &&
-    process.env.META_WEBHOOK_DEBUG_BYPASS_SIGNATURE === "true";
+  const bypassSignature = process.env.META_WEBHOOK_DEBUG_BYPASS_SIGNATURE === "true";
```
The removed comment read: *"Gated on NODE_ENV so this can never take effect in production even if the env var is accidentally left set there — it only applies to local dev."*

So between `35f6c7f` (Jun 27, `chore(prod): migrate to production domain + Meta webhook security hardening`, which stripped 99 lines / −128 net from the IG route) and `e5731fe` (Jul 14), **Instagram HMAC was fully enforced in production and the bypass was inert there.** That ~17-day window ended with a commit whose explicit purpose was to disable enforcement in production "for Instagram webhook diagnosis." **Inference: enforcement was tried in production and Instagram inbound did not work.** There is no commit in history in which Instagram verification is recorded as succeeding under enforcement.

**3. `E.txt` / `*.bak` ever committed? NO — see E4.** `git log --all --full-history` returns empty for both; `E.txt` is untracked and ignored at `.gitignore:56-57`. **Rotation is not forced by git history.** (It remains prudent for any secret that was ever in a local plaintext file, but this report claims no git-history exposure.)

**4. `E.txt` exists in the working tree right now:** yes — 3,869 bytes, mtime Jun 8 19:00. Contents not opened. No `*.bak` present on disk.

**Related history for context** (`git log -S 'x-hub-signature' --all`): `c96c83f`, `46e0b5c` (initial commits), `b333918`, `90db95c`, `d454aac` (`fix: Instagram webhook implementation + OAuth callback credential resolution`), `a32c992`, `44277d1`, `35f6c7f`. Note `d454aac` couples the webhook implementation to "OAuth callback credential resolution" — the same coupling A2/A7 identifies as the inversion.

### A9. HYPOTHESIS SCORECARD

| Hypothesis | Verdict | Evidence | What single piece of evidence would settle it |
|---|---|---|---|
| **H1** — the app owning the IG webhook subscription ≠ the app whose secret is in `META_APP_SECRET` | **UNKNOWN — mechanism now PROVEN, instance unconfirmed** | Inverted precedence: `getMetaConfig` = DB→env ([meta-config.ts:25-79](../lib/meta-config.ts)) vs webhook = env→DB ([instagram/route.ts:78-100](../app/api/webhooks/meta/instagram/route.ts)). Subscription is created with the `getMetaConfig` token ([callback:112](../app/api/auth/meta/callback/route.ts), [meta-instagram.ts:207](../lib/integrations/meta-instagram.ts)). `META_APP_SECRET` confirmed set in Production (`vercel env ls`). | **Compare `platform_settings.meta_app_id` (and any `meta_byo.config.app_id`) against production `META_APP_ID`.** Both are non-secret identifiers. Different ⇒ PROVEN. Both absent/equal ⇒ FALSIFIED. |
| **H2** — Instagram App Secret ≠ Facebook App Secret within the same Meta App | **UNKNOWN — cannot be resolved from this repo** | Code is Facebook-Login-shaped: `graph.facebook.com` + `www.facebook.com/dialog/oauth` only; `graph.instagram.com`/`api.instagram.com` absent. **But** OAuth sends `config_id` and **no `scope`** ([connect:58-67](../app/api/auth/meta/connect/route.ts)), so the product family is Dashboard-decided; scope families are mixed across docs ([META_APP_SETUP.md:71-75](../docs/META_APP_SETUP.md) FB-family vs [debug-token:144](../app/api/orgs/[orgId]/integrations/meta-instagram/debug-token/route.ts) IG-family); repo has exactly one Meta secret name. | **In the Meta App Dashboard, read which Instagram product is added** (*Instagram API with Instagram Login* vs *with Facebook Login*) **and whether an "Instagram App Secret" field exists under it.** Read-only Dashboard inspection; no value needs to be copied. |
| **H3** — BYO per-tenant Meta app credentials make an env-level secret structurally unable to verify | **SUPPORTED (mechanism) / UNKNOWN (instance)** | `meta_byo` is read by `getMetaConfig` at priority 1 ([meta-config.ts:25-44](../lib/meta-config.ts)) and is **never** read by either webhook. Storage confirmed in `integrations` per [017_platform_settings.sql:22-23](../supabase/migrations/017_platform_settings.sql). | **`select count(*) from integrations where provider='meta_byo' and active;`** ≥1 ⇒ SUPPORTED-in-fact; 0 ⇒ this branch CONTRADICTED (H1-via-`platform_settings` still stands). |
| **H4a** — wrong subscription `object` type (`page` vs `instagram`) | **UNLIKELY (partially CONTRADICTED)** | Subscription is created on the IG account id via `/{ig-id}/subscribed_apps` ([meta-instagram.ts:208](../lib/integrations/meta-instagram.ts)); the handler accepts **both** `object === "instagram"` and `"page"` and matches on either `instagram_business_account_id` **or** `page_id` ([instagram/route.ts:151,183-187](../app/api/webhooks/meta/instagram/route.ts)). Both shapes are tolerated, so object type cannot cause a *signature* failure. | n/a — object type affects routing, not HMAC. |
| **H4b** — route-level body/middleware difference | **CONTRADICTED** | Both routes read the body exactly once via `req.text()`, HMAC that exact string, and never re-serialize (A3 table). Middleware runs on both and never touches the body ([middleware.ts](../middleware.ts)). Only real deltas: absent `runtime`/`dynamic` exports on WA (functionally equivalent) and the bypass/401 failure-mode asymmetry. | n/a |
| **H4c** — stale/second subscription from an earlier app | **UNKNOWN** | `subscribeIgToWebhooks` is called on every OAuth callback and every `resubscribe` ([callback:112](../app/api/auth/meta/callback/route.ts), [resubscribe:93](../app/api/orgs/[orgId]/integrations/meta-instagram/resubscribe/route.ts)), and callback failures are swallowed non-fatally ([callback:114-116](../app/api/auth/meta/callback/route.ts)) — so the live subscription may predate the current credential config. | `GET /{ig-id}/subscribed_apps` — lists every subscribed app. (Superseded by the cheaper step below.) |

### ⭐ THE SINGLE CHEAPEST, SAFEST READ-ONLY NEXT STEP (not performed)

**Read two non-secret identifier values from Supabase and compare them to production `META_APP_ID`:**

```sql
select meta_app_id,
       (meta_app_secret_encrypted is not null) as has_secret,
       meta_app_mode, last_verified_at
from platform_settings where id = 1;

select org_id, config->>'app_id' as byo_app_id, active
from integrations where provider = 'meta_byo';
```

**Why this is the right step, ahead of `/debug-token` or any Graph call:**
- It returns **only identifiers and booleans — zero secrets**. Nothing needs redacting.
- It needs **no** Meta token, no `ENCRYPTION_KEY`, no app secret, no browser session.
- It is a plain `SELECT` (read-only, permitted).
- It resolves H1 **and** H3 in one shot, **unambiguously** — unlike `/debug-token`, whose mismatch signal is confounded with token expiry (A5 caveat).
- **Decision rule:** if `platform_settings.meta_app_id` is non-null and ≠ production `META_APP_ID`, **or** any `meta_byo.app_id` ≠ production `META_APP_ID` → **configuration mismatch PROVEN**. If `platform_settings.meta_app_id` is null/absent **and** zero `meta_byo` rows exist → the H1/H3 mechanism is **FALSIFIED**, and **H2 becomes the leading hypothesis**, settled next by Dashboard inspection.

Obtaining it requires Supabase read access, which this environment does not have (`supabase` CLI is installed, v2.62.5, but unauthenticated — no `SUPABASE_ACCESS_TOKEN`). The lowest-risk operator route is the Supabase **SQL Editor** in the dashboard, or `/admin/platform-settings` in the app (which returns `meta_app_id` with the secret masked — [platform-settings/route.ts:26-31](../app/api/admin/platform-settings/route.ts) selects `meta_app_id, meta_webhook_verify_token, meta_app_mode, last_verified_at, updated_at` and never the secret).

---

## 3. PART B — READ-ONLY PROJECT INVENTORY

### B1. Stack
Next.js **^14.2.35** App Router, React ^18, TypeScript ^5, package manager **npm** (`package-lock.json`; no pnpm/yarn/bun lockfile). **No Node version pin** — no `.nvmrc`, no `.node-version`, no `engines` field. CI pins Node 20; local is v24.17.0.

Key deps: `@supabase/supabase-js ^2` + `@supabase/ssr ^0.4.0`, `inngest ^3`, `openai ^4` (pointed at Groq), `@upstash/redis ^1.38.0` + `@upstash/ratelimit ^2.0.8`, `zod ^3.25.0`, `recharts ^3.8.1`, `framer-motion ^11.18.2`, `tesseract.js ^7.0.0`, `web-push ^3.6.7`, `nodemailer ^8.0.10`, `isomorphic-dompurify ^3.15.0`, `papaparse`, `qrcode`, Radix UI primitives, `@vercel/og`.

Scripts: `dev`, `build` (`cross-env NODE_OPTIONS='--max-old-space-size=4096' next build`), `start`, `lint`, `format`, `test:rls` (`tsx scripts/test-rls.ts`).

`next.config.js`: `eslint.ignoreDuringBuilds: true`; webpack `config.cache = false` for non-dev non-edge (memory pressure mitigation); image `remotePatterns` limited to `*.supabase.co`; a full **CSP** plus HSTS in `headers()` — `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `unsafe-eval` dropped in production (`unsafe-inline` for scripts retained).

`tsconfig.json`: `"strict": true`, `"skipLibCheck": true`. **`noUncheckedIndexedAccess` is not set.**

### B2. Route inventory
**104 `app/api/**/route.ts` files.** Guard tally: `assertMember` in 57, `assertAdmin`/`isAdminEmail` in 5, `auth.getUser` in 86, `createHmac` in 3.

Routes my heuristic flagged as having **no** recognizable guard (12), each then verified by hand:

| Route | Actual status |
|---|---|
| `admin/email-diagnostic` | ⚠️ **body-supplied `adminEmail` only — see E2** |
| `admin/email-test` | ⚠️ **body-supplied `adminEmail` only — see E2** |
| `auth/magic-link` | intentionally public; IP rate-limited (10/h) |
| `auth/signin-password` | intentionally public; IP rate-limited (10/15m) |
| `auth/signup-password` | intentionally public; IP rate-limited (10/h) |
| `funnel/[orgId]/submit` | intentionally public (lead capture); IP rate-limited (10/min) |
| `health`, `ping` | intentionally public liveness |
| `support/contact`, `waitlist` | intentionally public forms |
| `webhooks/razorpay/[orgId]` | ⚠️ **HMAC verified only conditionally — see E3** |
| `webhooks/razorpay-billing` | HMAC verified, fails closed — OK |

### B3. Auth model
Two clients in [lib/supabase/server.ts](../lib/supabase/server.ts): `createClient()` (anon key + session cookie ⇒ RLS enforced) and `createServiceClient()` (service-role ⇒ RLS bypassed). Sessions are cookie-based, refreshed on every request by [middleware.ts:52-56](../middleware.ts) via `supabase.auth.getUser()`.

**There is no shared authz module.** `assertMember` is **locally redefined in 57 separate route files** — copy-paste, not a single helper. `rg -l 'from "@/lib/authz"|from "@/lib/auth"' app/api` returns nothing. *(Opinion, flagged as such: this is the highest-leverage consistency risk in the codebase — 57 independent chances for one variant to drift.)*

`orgId` arrives as a URL path parameter and is then validated against `org_members` for the session user inside each route. The pattern is correct where applied; the risk is a route that omits it. Beyond E2/E3 I found no route that derives tenant scope from client input *without* a membership check.

### B4. Tenant isolation
**RLS is present and broad** — `row level security` / `create policy` occurrences across 20+ migrations, e.g. `001_initial_schema.sql` (23), `013_engagement.sql` (12), `011_completion.sql` (8), `019_groups_and_broadcasts.sql` (8), `007_phase6.sql` (6), `003_phase2.sql` (6), `010_cockpit.sql` (6), `018_...sql` (6).

`SUPABASE_SERVICE_ROLE_KEY` is referenced directly in only one runtime file — [lib/supabase/server.ts:55](../lib/supabase/server.ts) — plus scripts (`test-rls.ts`, `backfill-conversations.ts`, `apply-migration.ts`) and presence-checks in `admin/diagnostics`. Access is funnelled through `createServiceClient()`, used across ~60 files (top: `app/admin/health/page.tsx` 12, `on-booking-no-show.ts` 7, `on-ghost-revival.ts` 6, `on-dm-received.ts` 5, `on-payment-unpaid.ts` 5, `daily-metrics.ts` 5). In the webhook paths the org id is derived from the verified payload (IG: `entry[].id` → integration lookup; WA: `phone_number_id` → integration lookup), never from caller-supplied input — **which is exactly why E1's signature bypass is severe: it makes that "verified payload" unverified.**

### B5. Data model
41 tables via `CREATE TABLE` across 36 migrations:
`ai_drafts, ai_usage, analytics_events, audit_log, bookings, brevo_send_log, broadcast_deliveries, broadcast_sends, broadcasts, coach_checkins, coach_commitments, coach_goals, coach_scorecards, conversations, copilot_chats, error_log, events, founder_accounts, funnel_configs, integrations, job_runs, lead_events, lead_group_members, lead_groups, leads, messages, metrics_daily, milestones, org_members, orgs, payments, platform_settings, process_screenshots, scheduled_messages, sequence_runs, sequences, user_flags, user_push_subscriptions, voice_profiles, waitlist, was, webhook_events, whatsapp_templates`

(`was` looks like a typo'd/abandoned table — flagged as an observation, not investigated.) BYO Meta credentials live in `integrations` (`provider='meta_byo'`), not a dedicated table. `platform_settings` schema is quoted in A7.

### B6. Instagram inbound latency path (roadmap #4/#8)
**No `after()`, no `waitUntil`, no queue** — the only `waitUntil` occurrences are in `public/sw.js` (service worker, unrelated).

Ordered `await`s **before** the `200` at [instagram/route.ts:446](../app/api/webhooks/meta/instagram/route.ts):
1. *(middleware)* `supabase.auth.getUser()` — Supabase network call on every delivery
2. line 86-92 — `platform_settings` SELECT **only if** env secret missing (normally skipped)
3. line 108 — `req.text()`
4. line 162 — SELECT **all** active `meta_instagram` integrations (whole-table, not filtered by the incoming id)
5. line 242 — `webhook_events` INSERT — *fire-and-forget via `void (async () => …)()`, not awaited*
6. **line 272 — `getIgUserProfile()` — outbound Meta Graph HTTP call, 2,500 ms timeout** ← dominant cost
7. line 294 — `leads` SELECT
8. line 319/321/328 — `leads` UPDATE or INSERT
9. line 355 — `conversations` SELECT
10. line 368 — `conversations` INSERT (if new)
11. line 392 — `messages` INSERT
12. line 416 — `conversations` UPDATE (this is the write that triggers Realtime)
13. line 431 — `inngest.send({name:"dm.received"})` — **awaited**
14. line 446 — `return 200`

So a single inbound DM serialises **1 middleware auth call + up to 1 Graph HTTP call (≤2.5 s) + 5–7 sequential Supabase round-trips + 1 awaited Inngest publish** before Meta gets its 200. All of it is inside the request; nothing is deferred.

**WhatsApp, structurally different** ([whatsapp/route.ts](../app/api/webhooks/whatsapp/route.ts)):
- **No profile-enrichment HTTP call at all** — the display name comes free in the payload (`value.contacts[].profile.name`, line 134).
- The `leads` "last seen" UPDATE is **fire-and-forget** (`.then(() => {})`, line 150) rather than awaited.
- The message INSERT and conversation-preview UPDATE run **concurrently** via `Promise.all` (lines 202-215).
- `inngest.send()` is **not awaited** — fire-and-forget with `.catch()` (lines 225-228).

**Net structural difference:** WhatsApp has no outbound Graph call on the inbound path and parallelises/defers its writes; Instagram serialises everything and awaits a ≤2.5 s third-party call plus the Inngest publish. Instagram's per-DM pre-200 latency is structurally several times WhatsApp's. *(Reported only — no instrumentation added.)*

**Also note:** step 4 loads **every** active `meta_instagram` integration on every delivery and filters in JS ([instagram/route.ts:162-187](../app/api/webhooks/meta/instagram/route.ts)) — O(tenants) per webhook. Fine now, linear degradation later.

### B7. Realtime / UI
**Supabase Realtime `postgres_changes`**, three channels, no polling for the inbox:
- `components/inbox/thread-view.tsx:129` — `thread:${convId}` (messages)
- `components/inbox/thread-view.tsx:167` — `drafts:${convId}` (ai_drafts) — the comment at line 161 notes this *"replaces the previous 5-second setInterval poll"*
- `components/inbox/inbox-shell.tsx:111,116,163` — `inbox-shell:${orgId}` (conversations list)

Enabled by [024_realtime_conversations_and_drafts.sql](../supabase/migrations/024_realtime_conversations_and_drafts.sql). No `refetchInterval`, no SWR/react-query, no `EventSource`. Remaining `setInterval` uses are cosmetic (`copilot-panel.tsx:121`, `process-view.tsx:157`).

**Linkification** (relevant to the Instagram mobile link-clickability issue) is a local helper: [components/inbox/linkify.tsx:6](../components/inbox/linkify.tsx) → `export function linkify(text: string): React.ReactNode`, consumed at `thread-view.tsx:93,97` (both message bubble branches) and `ai-draft-card.tsx:87`.

### B8. Outbound send path
Single abstraction: `deliverOutboundMessage()` — [lib/conversation.ts:121](../lib/conversation.ts), branching to `sendInstagramMessage()` (line 165) and `sendWhatsAppMessage()` (line 223).
- **Instagram** — [meta-instagram.ts:237-278](../lib/integrations/meta-instagram.ts): `POST {GRAPH}/{page_id}/messages` with the decrypted page token **in the query string**. **No retry, no explicit timeout, no idempotency key.** Non-OK ⇒ logs the raw Graph body and throws; a non-JSON body is caught separately. Note it sends via **`page_id`**, while the *subscription* is created on the **IG account id** — a page-centric send paired with an IG-centric subscribe.
- **WhatsApp** — [whatsapp-cloud.ts:20](../lib/integrations/whatsapp-cloud.ts) (`sendWhatsAppMessage`) and `:56` (`sendWhatsAppTemplate`), with a module-level config cache at `:153` to avoid a DB round-trip per send.
- Idempotency is handled **upstream**, not in the senders: the 5-minute duplicate-content guard in `on-dm-received.ts`.

### B9. Observability
**No Sentry, Axiom, Logtail, PostHog, or Datadog** — none present. Self-rolled only: [lib/log.ts](../lib/log.ts), an `error_log` table ([009_error_log.sql](../supabase/migrations/009_error_log.sql)), `app/admin/errors/page.tsx`, and `job_runs` via `lib/job-logger.ts`.
**No correlation/request id anywhere.** Logs are unstructured `console.*` string interpolation.

`console.*` counts on webhook/integration paths:
| File | Count |
|---|---|
| `app/api/webhooks/meta/instagram/route.ts` | **47** |
| `app/api/webhooks/whatsapp/route.ts` | 9 |
| `lib/integrations/meta-instagram.ts` | 7 |
| `app/api/webhooks/manychat/[orgId]/route.ts` | 5 |
| `app/api/webhooks/manychat-handoff/[orgId]/route.ts` | 4 |
| `lib/integrations/whatsapp-cloud.ts` | 2 |
| `app/api/webhooks/calcom/[orgId]/route.ts` | 2 |
| `app/api/webhooks/razorpay/[orgId]/route.ts` | 1 |

The IG route's 47 log statements are residual debugging density from the diagnosis effort. One of them logs `secret_len=${appSecret.length}` ([instagram/route.ts:114](../app/api/webhooks/meta/instagram/route.ts)) — a secret **length** disclosure to logs. Not a value, but it is a metadata leak and the closest surviving relative of the fingerprint logging removed in item #2.

### B10. OAuth `state` / CSRF (roadmap #9)
**Generation** — [connect/route.ts:56](../app/api/auth/meta/connect/route.ts):
```ts
const state = Buffer.from(JSON.stringify({ orgSlug, userId: user.id })).toString("base64url");
```
**Validation** — [callback/route.ts:43-56](../app/api/auth/meta/callback/route.ts):
```ts
const decoded = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
orgSlug = decoded.orgSlug; userId = decoded.userId;
...
const { data: { user } } = await supabase.auth.getUser();
if (!user || user.id !== userId) { return NextResponse.redirect(`${appUrl}/login`); }
```
**Assessment (flagged as opinion):** `state` is **unsigned, unencrypted, base64url-only, and not stored server-side** — it is a transparent encoding, not a nonce. Its only integrity check is that the embedded `userId` equals the live session user. That does defeat cross-user injection (an attacker cannot make victim B's session accept a state naming user A). It does **not** provide a single-use nonce, and `orgSlug` is attacker-mutable to any slug the session user can pass — the callback then resolves that org via the **service-role** client ([callback:59-62](../app/api/auth/meta/callback/route.ts)) **without an `org_members` membership check**, unlike the 57 routes that do check. Worth a closer look during #9; not exploitable across users on this reading.

### B11. Rate limiting + CI
**Rate limiting:** [lib/ratelimit.ts](../lib/ratelimit.ts) — Upstash sliding window with an in-memory fallback; `rateLimitAsync()` (preferred) and a legacy sync `rateLimit()`. Applied on `auth/magic-link` (10/h), `auth/signin-password` (10/15m), `auth/signup-password` (10/h), `auth/callback`, `funnel/[orgId]/submit` (10/min). **No rate limiting on any `/api/orgs/**` route and none on any webhook.** `docs/SCALE.md:44-71` documents a broader design not yet implemented.

**CI:** exactly one workflow, [.github/workflows/security.yml](../.github/workflows/security.yml) — on push/PR to `main`, Node 20, `npm ci --ignore-scripts`, then `npm audit --audit-level=high`. **No typecheck, no lint, no tests, no build in CI.**
**Tests: ZERO.** No `*.test.ts`/`*.spec.ts` files; no test framework in `devDependencies`. The only test-shaped artifact is `scripts/test-rls.ts` (manual, run via `npm run test:rls`, needs `RLS_ORG_A_ID`/`RLS_ORG_B_ID`/`RLS_USER_B_EMAIL`/`RLS_USER_B_PASSWORD`).

### B12. AI cost surface + the local build failure

**AI providers/models** — one provider (Groq via the OpenAI SDK), configured at `LLM_BASE_URL` (default `https://api.groq.com/openai/v1`). Client construction: [lib/ai.ts:151,156](../lib/ai.ts) (`maxRetries: 0`, `timeout: 20_000`, multi-key round-robin). Completion call sites: `lib/ai.ts:167` (shared `callLLM`), `lib/ai.ts:400` (streaming). Independent clients that bypass the pool: [app/api/orgs/[orgId]/transcribe/route.ts:51](../app/api/orgs/[orgId]/transcribe/route.ts) and [app/api/orgs/[orgId]/copilot/message/route.ts:92](../app/api/orgs/[orgId]/copilot/message/route.ts) — both construct their own `baseURL`, so they are outside the key-rotation and cooldown logic.

**Local `next build` failure — a specific, testable mechanism (HYPOTHESIS ONLY, no fix attempted):**

[lib/ai.ts:182-190](../lib/ai.ts):
```ts
const MODEL_FAST  = process.env.LLM_MODEL_FAST  ?? "llama-3.1-8b-instant";
const MODEL_SMART = process.env.LLM_MODEL_SMART ?? "llama-3.3-70b-versatile";

const PRICE: Record<string, { in: number; out: number }> = {};
Object.defineProperty(PRICE, MODEL_FAST,  { get: () => ({ … }), enumerable: true });
Object.defineProperty(PRICE, MODEL_SMART, { get: () => ({ … }), enumerable: true });
```

`Object.defineProperty` defaults to **`configurable: false`**. If `MODEL_FAST === MODEL_SMART`, the second call targets an already-defined non-configurable key and throws **`TypeError: Cannot redefine property`** at *module evaluation* time — which, in a Next build, surfaces during page-data collection rather than as a clean type error.

The `??` operator only falls back on `null`/`undefined`, **not on `""`**. The local `.env.local` (Vercel-CLI-generated) has **`LLM_MODEL_FAST=""` and `LLM_MODEL_SMART=""`** — both empty strings. So locally `MODEL_FAST === MODEL_SMART === ""`, the same key is defined twice, and the module throws. In Vercel Production both vars hold distinct real values, so the keys differ and the module loads — **which is exactly why the failure is local-only.** This matches the observed symptom: `build-output.txt` ends with `Next.js build worker exited with code: 134 and signal: null` (134 = SIGABRT, an abnormal worker abort, consistent with a throw during module evaluation under the memory-capped worker).

**Confidence: high on the mechanism, unverified as the *sole* cause** — `build-output.txt` is UTF-16-ish/mojibake and its tail shows only a raw address dump plus the worker-exit line, with no readable stack, so the `TypeError` is not directly visible in the captured log. The three files named in the task (`assistant/draft-three`, `dashboard/seed`, `inbox/draft`) show **no** duplicated `export const` and **no** `Object.defineProperty` — `draft-three/route.ts:8` has a single `export const maxDuration = 30`, `dashboard/seed/route.ts` has no `export const` at all. The **only** `Object.defineProperty` calls in `app/` + `lib/` are the two in `lib/ai.ts` above, and `lib/ai.ts` is transitively imported by all three of those routes — which is consistent with the failure appearing to originate there. **No fix applied.**

---

## 4. REDACTION CHECKLIST

✅ **Confirmed: no secret value appears anywhere in this report.**
- `E.txt` was **never opened**. Only its metadata is reported (size, mtime, ignore status).
- No `*_SECRET` / `*_KEY` / `*_TOKEN` / `*_PASSWORD` value is printed. Only **names**.
- `vercel env pull` was **not** run in this session; only `vercel env ls` (names + environments + created-at, no values).
- No Supabase query was executed; no DB values were read.
- The only credential-adjacent *value* mentioned is a length **reference in code** (`secret_len=${appSecret.length}` at [instagram/route.ts:114](../app/api/webhooks/meta/instagram/route.ts)) — reported as a code location, not as a measured length.
- Identifiers deliberately included (safe per contract): IG Business Account `17841424594812508`, Facebook Page `1209422672248916`, Business-Login `config_id 1303123918594190`, Graph version `v18.0`, Vercel project `effora-ai-qh35`.

**Before pasting `/debug-token` JSON into chat, redact exactly:**
```
tokens.page_token.debug.user_id
tokens.user_token.debug.user_id
tokens.*.debug.raw_error      (only if it contains a long opaque string)
```
Safe to share as-is: `debug.app_id`, `debug.application`, `debug.type`, `debug.is_valid`, `debug.expires_at`, `debug.scopes[]`, `debug.granular_scopes[]`, `debug.error`, `answer_criteria.*`, `ig_username`, `page_id`, `instagram_business_account_id`, `question`.

---

## 5. BLOCKED / UNKNOWN

| # | Question | Status | Exactly what would answer it |
|---|---|---|---|
| 1 | Which Meta App owns the live Instagram webhook subscription? | **UNKNOWN** | `GET /v18.0/17841424594812508/subscribed_apps` with a valid page/system-user token — **or**, preferably, the A9 SQL identifier comparison, which needs no token. |
| 2 | Which Meta App does production `META_APP_SECRET` belong to? | **UNKNOWN** | Production `META_APP_ID` (write-only in Vercel; readable via the Vercel dashboard "reveal", or via `/admin/platform-settings` if the value came from the DB). Non-secret. |
| 3 | Is `platform_settings` row 1 populated, and with which `meta_app_id`? | **UNKNOWN — BLOCKED** | The A9 `SELECT`. Needs Supabase read access. `supabase` CLI is installed (v2.62.5) but **unauthenticated** — no `SUPABASE_ACCESS_TOKEN`. |
| 4 | Do any `meta_byo` rows exist? | **UNKNOWN — BLOCKED** | Same `SELECT`, same blocker. |
| 5 | Is the Meta App configured as *Instagram API with Instagram Login* (separate Instagram App Secret) — i.e. H2? | **UNKNOWN — unanswerable from this repo** | Read-only Meta App Dashboard inspection: which Instagram product is added, and whether an "Instagram App Secret" field exists. The repo cannot know, because OAuth sends `config_id` with no `scope`. |
| 6 | Which permissions were actually granted at the last OAuth run? | **UNKNOWN** | `debug.granular_scopes[]` from `/debug-token`, or the Dashboard Business-Login configuration for `config_id 1303123918594190`. |
| 7 | Is there more than one subscribed app (a stale subscription)? | **UNKNOWN** | `GET /{ig-id}/subscribed_apps` returns the full list. |
| 8 | Did Instagram HMAC ever verify successfully in production? | **STRONGLY INDICATED "NO", not proven** | Vercel runtime logs for `/api/webhooks/meta/instagram` between Jun 27 (`35f6c7f`) and Jul 14 (`e5731fe`), grepping `sig_match=` / `✓ signature verified`. Log retention on the Hobby plan almost certainly no longer covers that window. |
| 9 | Is the `lib/ai.ts` `defineProperty` collision the sole cause of the local build failure? | **HYPOTHESIS, high confidence, unverified** | A readable build log. `build-output.txt` is mojibake with no stack trace. Verification would require running a build — **out of scope by rule.** |
| 10 | Actual pre-200 latency for IG vs WA | **NOT MEASURED (by rule)** | Vercel function duration metrics for the two webhook routes. No instrumentation was added. |

**No task in this session required a change to satisfy.** Nothing was BLOCKED by the read-only constraint itself; items 3 and 4 are blocked purely by missing Supabase authentication.

**No fix was proposed or applied.**
