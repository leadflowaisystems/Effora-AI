# GATE 0 — EVIDENCE PACKET (operator-run, read-only)

**Purpose:** collect the four pieces of evidence that discriminate between H1, H2, and H3 for the Instagram HMAC failure, so a reviewer can pick the single correct fix.
**Who runs this:** you (the human operator). Claude prepared and verified it but executed nothing.
**Time:** ~15 minutes. **Nothing here changes any live system.** All steps are reads.
**Prepared against commit:** `8b8416c`. Every table, column, and route below was verified to exist in the repo; citations are `file:line`.

---

## ⚠️ FOUR CORRECTIONS TO THE ORIGINAL PLAN (verified against the repo)

**C1 — `/admin/platform-settings` cannot give you the env `META_APP_ID`.** The GET route selects **only** from the `platform_settings` table and has **no env fallback**: `select("meta_app_id, meta_webhook_verify_token, meta_app_mode, last_verified_at, updated_at")` — [app/api/admin/platform-settings/route.ts:26-29](../app/api/admin/platform-settings/route.ts). If that table is empty the App ID field simply renders blank ([page.tsx:36](../app/admin/platform-settings/page.tsx) — `setAppId(s.meta_app_id ?? "")`). So this page reads **the same DB value that Part 1 Query A reads** — it is a *cross-check of Part 1*, **not** the baseline. The baseline must come from Vercel (Part 2). Good news: that route never returns the secret column, so it is safe to open.

**C2 — `NEXT_PUBLIC_META_APP_ID` is NOT readable from the browser.** It is declared only as a getter in [lib/env.ts:83-84](../lib/env.ts) and referenced by **no** client component. Worse, `lib/env.ts:8` reads `process.env[name]` by **dynamic index**, which Next.js cannot statically inline at build time — so this value is `undefined` in any browser bundle regardless. It is not a shortcut to the App ID. Do not try it.

**C3 — Do NOT add `meta_config_id` to the SQL.** `lib/meta-config.ts:61` reads `platformRow.meta_config_id`, but that column **does not exist in any migration** (`rg 'meta_config_id' supabase/` → zero hits) and is not in the `select` at [meta-config.ts:50](../lib/meta-config.ts). It is always `undefined`, so `config_id` always falls through to `process.env.META_CONFIG_ID`. Adding that column to a query would throw `column does not exist`. (Latent bug, noted; out of scope.)

**C4 — `integrations.config` is `JSONB`, so the `?` key-existence operator is valid.** Confirmed at [001_initial_schema.sql:36](../supabase/migrations/001_initial_schema.sql) — `config JSONB NOT NULL DEFAULT '{}'`. Had it been `json`, `config ? 'key'` would have errored. Also confirmed: `updated_at` exists on `integrations`, added by [002_phase1.sql:12-13](../supabase/migrations/002_phase1.sql), so the queries below may safely order by it.

---

## PART 1 — Supabase SQL Editor: **the decisive read**

Open **Supabase Dashboard → your project → SQL Editor → New query**, paste the whole block below, run it.

**Schema verification:** all columns used below exist — `platform_settings(id, meta_app_id, meta_app_secret_encrypted, meta_webhook_verify_token, meta_app_mode, last_verified_at, updated_at, updated_by)` per [017_platform_settings.sql:4-14](../supabase/migrations/017_platform_settings.sql); `integrations(id, org_id, provider, config, active, created_at)` per [001_initial_schema.sql:32-39](../supabase/migrations/001_initial_schema.sql) plus `updated_at` per [002_phase1.sql:12-13](../supabase/migrations/002_phase1.sql). The `meta_byo` config keys `app_id` / `app_secret_enc` are the ones the code actually reads — [lib/meta-config.ts:35](../lib/meta-config.ts).

```sql
-- ════════════════════════════════════════════════════════════════
-- GATE 0 EVIDENCE — READ-ONLY. Returns identifiers + booleans only.
-- No secret column is ever selected. Nothing here needs redacting.
-- ════════════════════════════════════════════════════════════════

-- 0) PREFLIGHT — who am I running as? Expect 'postgres'.
--    If this returns 'anon' or 'authenticated', RLS will HIDE rows and
--    every result below is untrustworthy. Stop and use the SQL Editor
--    as the project owner instead.
select current_user as running_as;

-- 0b) Does the platform_settings row exist at all? Disambiguates
--     "no row configured" from "RLS hid the row".
select count(*) as platform_settings_row_count from platform_settings;

-- A) THE PLATFORM-LEVEL META APP IDENTITY  (no secret returned)
select
  meta_app_id,
  (meta_app_secret_encrypted is not null) as has_secret,
  meta_app_mode,
  last_verified_at,
  updated_at
from platform_settings
where id = 1;

-- B0) PROVIDER LANDSCAPE — one row per integration type.
--     Settles H3 at a glance and shows what else is connected.
select
  provider,
  count(*)                          as total,
  count(*) filter (where active)    as active_count
from integrations
group by provider
order by provider;

-- B) PER-TENANT BYO META APP OVERRIDES  (no secret returned)
select
  org_id,
  config->>'app_id'            as byo_app_id,
  (config ? 'app_secret_enc')  as has_byo_secret,
  config->>'mode'              as byo_mode,
  active,
  created_at,
  updated_at
from integrations
where provider = 'meta_byo'
order by updated_at desc;

-- C) ACTIVE BYO COUNT — the single number that settles H3
select count(*) as active_byo_count
from integrations
where provider = 'meta_byo' and active = true;

-- D) THE LIVE INSTAGRAM INTEGRATION  (no secret returned)
--    Cross-check ig_business_account_id against 17841424594812508
--    and page_id against 1209422672248916.
--    has_user_token = false means the manual resubscribe path cannot run.
--    token_expires_at = null means a system-user token (never expires).
select
  org_id,
  config->>'page_id'                        as page_id,
  config->>'instagram_business_account_id'  as ig_business_account_id,
  config->>'ig_username'                    as ig_username,
  config->>'token_expires_at'               as token_expires_at,
  (config ? 'access_token_enc')             as has_page_token,
  (config ? 'user_access_token_enc')        as has_user_token,
  active,
  created_at,
  updated_at
from integrations
where provider = 'meta_instagram'
order by updated_at desc;
```

*Query D key names verified against `saveMetaIntegration` — [lib/integrations/meta-instagram.ts:392-403](../lib/integrations/meta-instagram.ts).*

### Decision rule — paste this back alongside your results

| Result | Conclusion |
|---|---|
| `meta_app_id` is **non-null** and **differs** from env `META_APP_ID` (Part 2) | **H1 mismatch PROVEN** |
| Any `byo_app_id` **differs** from env `META_APP_ID` | **H1 / H3 mismatch PROVEN** |
| `meta_app_id` is **null/no row** AND `active_byo_count = 0` | **DB-vs-env mechanism FALSIFIED** → H2 becomes leading, settled by Part 3 |
| `meta_app_id` is non-null and **equals** env `META_APP_ID` | This branch falsified → H2 leading |

**This entire block returns nothing secret. Paste the results verbatim — there is nothing to redact.**

---

## PART 2 — The production env `META_APP_ID` (the comparison baseline)

An App ID is a **public identifier**, not a credential. But it is stored write-only in Vercel, so it must be read from the dashboard.

**Step 2.1 — Vercel dashboard (the only reliable source).**
Vercel → project **`effora-ai-qh35`** → **Settings → Environment Variables** → find `META_APP_ID` (Production scope) → click the reveal/eye icon → copy the value.
**Read only. Do not edit, do not save, do not touch `META_WEBHOOK_DEBUG_BYPASS_SIGNATURE`.**

**Step 2.2 — Confirm the env vars are actually present (optional, 10 seconds, zero secrets).**
Logged in as an `ADMIN_EMAILS` account, open:
```
https://www.effora.co.in/api/admin/diagnostics
```
Verified to exist and to return **booleans only** for every secret — [app/api/admin/diagnostics/route.ts:52-55](../app/api/admin/diagnostics/route.ts) returns `meta_app_id: !!process.env.META_APP_ID`, `meta_app_secret: !!…`, `meta_config_id: !!…`, `meta_webhook_verify: !!…`. Admin-gated via `isAdminEmail()` ([lib/admin.ts](../lib/admin.ts), backed by `ADMIN_EMAILS`). It confirms *presence*, never values. Safe to paste in full.

**Step 2.3 — Cross-check against the DB (per correction C1).**
Logged in as an admin, open `https://www.effora.co.in/admin/platform-settings`. The **Meta App ID** field ([page.tsx:121-122](../app/admin/platform-settings/page.tsx)) shows the value from `platform_settings` — the *same* value as Part 1 Query A, and **blank if that table is empty**. The App Secret field only ever shows dots as a placeholder ([page.tsx:132](../app/admin/platform-settings/page.tsx)); the secret is never sent to the browser. Use this purely to confirm Query A. **Do not click Save.**

➡️ **Paste back: the `META_APP_ID` value only.** It is a safe identifier.
🚫 **Never paste `META_APP_SECRET`.**

---

## PART 3 — Meta App Dashboard read-only checklist (settles **H2**)

Go to `https://developers.facebook.com/apps`. **Read only — copy no secret values, click no Save/Generate/Regenerate button.** Meta reorganises this UI periodically, so each item says *what to look for* rather than an exact click path.

**3.1 — App inventory.** *(feeds H1)*
List **every** app in the business portfolio, with **name + App ID** for each. Note specifically whether the App ID from Part 2 is present, and whether **more than one** app exists. If two apps exist and only one shows Instagram, that is the shape of H1.

**3.2 — Instagram product identification.** *(THE H2 DETERMINANT — the single most important item in Part 3)*
On the app that has Instagram, open the Instagram product and record:
- **a)** Which product is added: **"Instagram API with Instagram Login"** or **"Instagram API with Facebook Login"** (the latter is Messenger-via-Page).
- **b)** If a section like **"API setup with Instagram login"** exists: does it display an **Instagram App ID** and a **separate Instagram App Secret** field? → paste the **Instagram App ID** (safe identifier) and answer **yes/no** for whether a distinct Instagram App Secret field exists. **Never paste the secret value itself.**
- **c)** If both setup paths are listed, say which one is configured/complete.

**Why this decides it:** if a separate Instagram App Secret exists and the product is *Instagram Login*, Meta signs `object: "instagram"` webhooks with **that** secret — which this codebase has never held (the repo contains exactly one Meta secret name, `META_APP_SECRET`, and zero references to any Instagram-specific secret). That makes H2 true independently of any App ID comparison.

**3.3 — Webhooks page, for EACH app.** *(feeds H1 + H4c stale-subscription)*
Record, per app:
- which **objects** are subscribed — `instagram`, `page`, `whatsapp_business_account`;
- the **callback URL** shown for each object;
- the **subscribed fields** for each (expect `messages` for Instagram — set by [lib/integrations/meta-instagram.ts:209](../lib/integrations/meta-instagram.ts)).

Expected effora callbacks: `https://www.effora.co.in/api/webhooks/meta/instagram` and `https://www.effora.co.in/api/webhooks/whatsapp`. **If the `instagram` object and the `whatsapp_business_account` object live on *different apps*, H1 is confirmed from the Dashboard side.** All of this is non-secret.

**3.4 — Business Verification status.** *(feeds the later App Review plan — capture now)*
Verified / In review / Not started.

**3.5 — App mode and access level.** *(feeds App Review + explains the 5-tester limit)*
**Live** vs **Development**, and for each Instagram/messaging permission whether **Advanced Access** or **Standard Access** is shown. Also note the value of `META_APP_MODE` you saw in Part 1 Query A (`meta_app_mode`) and whether it agrees with the Dashboard.

---

## PART 4 — `/debug-token` confirmatory read (secondary)

Route verified to exist: [app/api/orgs/[orgId]/integrations/meta-instagram/debug-token/route.ts](../app/api/orgs/[orgId]/integrations/meta-instagram/debug-token/route.ts). Auth is a real membership check — `assertMember()` at lines 56-64 queries `org_members` for `(orgId, session user)` through the RLS-scoped client, so you must be logged in as a member of that org.

**Steps**
1. Log into `https://www.effora.co.in`.
2. Find your **`orgId` (UUID)**: open DevTools → **Network**, load your Instagram settings or health page, and copy the UUID from any `/api/orgs/<UUID>/...` request.
3. In the same authenticated browser, open:
   ```
   https://www.effora.co.in/api/orgs/<orgId>/integrations/meta-instagram/debug-token
   ```
4. Copy the JSON.

**Exact JSON shape (key list only, from the repo — no values):**
```
ig_username
page_id
instagram_business_account_id
tokens.page_token.description
tokens.page_token.expected_type
tokens.page_token.debug.{app_id, application, type, is_valid, expires_at,
                         scopes[], granular_scopes[], user_id, error, raw_error}
tokens.user_token.description
tokens.user_token.expected_type
tokens.user_token.debug.{... same keys ...}
question
answer_criteria.required_token_type
answer_criteria.required_scopes[]
answer_criteria.required_app_id
```

**Redact before pasting into chat:**
```
tokens.page_token.debug.user_id
tokens.user_token.debug.user_id
tokens.*.debug.raw_error      (only if it contains a long opaque string)
```

**Safe to paste as-is:** `debug.app_id`, `debug.application`, `debug.type`, `debug.is_valid`, `debug.expires_at`, `debug.scopes[]`, `debug.granular_scopes[]`, `debug.error`, `answer_criteria.*` (especially `answer_criteria.required_app_id`), `ig_username`, `page_id`, `instagram_business_account_id`, `question`.

**⚠️ Why this is confirmatory only, not decisive:** the endpoint builds its app-access token from the **env** app (`${META_APP_ID}|${META_APP_SECRET}` at [debug-token/route.ts:42](../app/api/orgs/[orgId]/integrations/meta-instagram/debug-token/route.ts)). Meta will not cleanly introspect a token minted by a *different* app — it returns an `OAuthException` / error code **190** instead, which is **indistinguishable from an expired or revoked token**. So this can cleanly **falsify** a mismatch (a valid `app_id` equal to `required_app_id` ⇒ same app) but **cannot cleanly prove one**. **Part 1 is the decisive read.**

---

## WHAT TO PASTE BACK

1. **Part 1 SQL results** — all six result sets (preflight `running_as`, row count, A, B0, B, C, D). **Nothing to redact.**
2. **Part 2** — the env `META_APP_ID` value (identifier only). Optionally the `/api/admin/diagnostics` JSON (booleans only, safe in full).
3. **Part 3** — app count + every app name/App ID; the Instagram **product name**; **yes/no** whether a separate Instagram App Secret field exists (+ the Instagram App ID if shown); per-app subscribed **objects + callback URLs + fields**; Business Verification status; app mode + Advanced/Standard access.
4. **Part 4** — the `/debug-token` JSON, redacted per the list above.

> **Reminder: paste NO `*_SECRET`, `*_KEY`, `*_TOKEN`, or password values.** Every item requested above is an identifier, a boolean, a URL, or a status string. If a step ever seems to require a secret to answer, skip it and say so — it means the packet is wrong, not that you should paste the secret.

---

## ITEMS CLAUDE COULD NOT VERIFY — CONFIRM LIVE

| # | Item | Why unverifiable from the repo |
|---|---|---|
| 1 | Whether `platform_settings` row 1 exists and what `meta_app_id` holds | Requires DB read. Part 1 Query A + preflight 0b. |
| 2 | Whether any `meta_byo` row exists | Requires DB read. Part 1 Queries B0/B/C. |
| 3 | The production env `META_APP_ID` value | Write-only in Vercel; `vercel env pull` returns blanks for sensitive vars. Part 2.1. |
| 4 | Which Instagram product is configured, and whether a separate Instagram App Secret exists | **Structurally unknowable from any repository** — OAuth sends `config_id` and no `scope` ([app/api/auth/meta/connect/route.ts:58-67](../app/api/auth/meta/connect/route.ts)), so the product family and permission set live entirely in the Dashboard. Part 3.2. |
| 5 | How many Meta apps exist, and which app each webhook object is subscribed on | Dashboard-only state. Part 3.1 / 3.3. |
| 6 | The live callback URL registered per object | Dashboard-only; the repo never sets `override_callback_uri` (verified absent). Part 3.3. |
| 7 | Business Verification status, app mode, Advanced vs Standard access | Dashboard-only. Part 3.4 / 3.5. |
| 8 | Whether the SQL Editor session will bypass RLS | `platform_settings` is service-role-only ([017:19-20](../supabase/migrations/017_platform_settings.sql)) and `integrations` is `is_org_member(org_id)` ([001:192](../supabase/migrations/001_initial_schema.sql)). The SQL Editor normally runs as `postgres`, which bypasses RLS — but preflight query 0 makes this explicit rather than assumed. |
| 9 | Whether the `provider` value written by OAuth matches what the WhatsApp webhook reads | **Possible latent inconsistency spotted, not investigated (out of scope):** `saveWhatsAppIntegration` writes `provider: "meta_whatsapp"` ([meta-instagram.ts:448,458](../lib/integrations/meta-instagram.ts)) while the WhatsApp webhook queries `provider = "whatsapp_cloud"` ([whatsapp/route.ts:111](../app/api/webhooks/whatsapp/route.ts)). Part 1 Query **B0** will reveal which provider strings actually exist in the table. Flagged for the reviewer; **no action taken.** |

---

*Prepared read-only at commit `8b8416c`. No code, config, environment variable, deployment, or database was read-modified or executed. No Graph API or Supabase network call was made. No fix is proposed in this document.*
