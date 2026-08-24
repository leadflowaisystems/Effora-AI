# DEFERRED

Things noticed during the launch program that were deliberately **not** built, to protect scope.
Nothing here blocks client #1. Each entry: what, where, why deferred.

---

## Deferred during Phase 1 (Security Closeout)

**Razorpay HMAC uses a non-constant-time comparison**
`lib/razorpay.ts:181-183` — `verifyWebhookSignature` returns `signature === expected`.
The Instagram webhook was upgraded to `timingSafeEqual` because it was already being rewritten;
Razorpay's helper is shared by other call sites and changing it is a refactor of working code.
Practical risk is very low (remote timing attacks over HTTPS against an HMAC are not realistic).
*Effort if wanted: 15 min.*

**WhatsApp webhook also uses `===` for HMAC comparison**
`app/api/webhooks/whatsapp/route.ts:82` — same reasoning as above. WhatsApp verification is
working and fails closed; touching it before client #1 is unnecessary risk.
*Effort: 15 min.*

**`build-output.txt` is committed to the repo**
42 KB mojibake crash log at repo root, tracked in git. Verified to contain **no** secret-shaped
strings (checked for `eyJ`, `gsk_`, `rzp_`, `postgres://`, `xkeysib`, `SERVICE_ROLE` — zero hits).
Clutter, not a leak. Removing it is a git write with no launch value.

**65 stale `backup-*` / `rollback-*` branches**
`git branch -a` lists 65 local + remote branches from an emergency-commit workflow.
Cleanup is cosmetic and risky to automate. Not touching.

**`platform_settings.meta_config_id` is read but does not exist**
`lib/meta-config.ts:61` reads `platformRow.meta_config_id`; that column is in no migration and is
not in the `select` at line 50, so it is always `undefined` and `config_id` always falls through to
`process.env.META_CONFIG_ID`. Harmless today. Belongs with the Instagram work, which is deferred.

**Instagram signature root cause (`meta_byo` vs env precedence inversion)**
Explicitly out of scope per instruction. The webhook now fails closed in production, so the
insecure state is gone regardless. Evidence packet to diagnose it is already prepared at
`_gate0/EVIDENCE_PACKET.md`. Scheduled for Phase 7.2.

**`ADMIN_EMAILS` env var is now unused by the two email routes**
Still used by `lib/admin.ts` → `/api/admin/diagnostics` and `/api/admin/platform-settings`.
Two parallel admin models now coexist (`ADMIN_EMAILS` vs `FOUNDER_EMAILS` + `founder_accounts`).
Consolidating them would prevent future drift. *Effort: 1h.* Not a launch blocker.

**Razorpay secret-lookup failures are reported as 401, not 503**
`lib/razorpay.ts:203-205` wraps the lookup in `catch { return null }`, so a transient Supabase
outage becomes "no secret configured" → 401. Razorpay treats 401 as permanent auth failure and
burns its retry budget. A 503 would be correct for "couldn't load the secret". Low probability,
but worth fixing before high payment volume. *Effort: 30 min.*

**Razorpay `payment.captured` (order-based) events never match a payment row**
`app/api/webhooks/razorpay/[orgId]/route.ts:66,73` compares a Razorpay `order_id` against the
`payment_link_id` column, so order-based captures log "payment row not found" and no-op.
Pre-existing, unrelated to the Phase 1 fix. Payment *links* (the path we actually use) work.
*Effort: 1h.*

**Webhook rejection logs interpolate the raw `orgId` path segment**
Unauthenticated callers can drive log volume and inject newlines into the Vercel log stream via
`/api/webhooks/razorpay/<arbitrary>`. Validate as UUID + rate-limit rejections. *Effort: 30 min.*

**No dual-secret support for Meta app-secret rotation**
A `META_APP_SECRET_PREV` fallback existed once and was removed. With the webhook now failing
closed, a deliberate secret rotation has a hard-401 window instead of silently dropping events.
Irrelevant while Instagram is deferred. *Effort: 45 min when Instagram resumes.*

---

## Deferred by explicit scope rule

- **Instagram signature root-cause debugging** — Phase 7.2 will scope it; only implemented if <2h and zero-risk.
- **Tests / CI** — repo has zero test files and only an `npm audit` workflow. Post-revenue.
- **`sequences` table** — dead table, no code queries it. Ghost revival covers client #1's nurture need.
- **Voice / missed-call handling** — no code exists. Out of the WhatsApp-first path.
- **Graph API v18.0 → current** — 7 occurrences; v18.0 silently falls forward. Not urgent.

---

*Last updated: Phase 1.*
