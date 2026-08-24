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

## ⚠️ PART 2 RE-SCOPE — READ BEFORE STARTING PHASE 6

**`origin/main` already contained work the Part 2 plan assumes is missing.** Discovered
during the Phase 2 → main merge: commit `d4c17e1` ("feat(meta-review): data deletion callback,
Graph API v23.0, debug endpoint cleanup") plus `45ed177` and `1e88943` were on `main` but not on
the `rollback-test` lineage all earlier audits were run against.

Already present on `main` today — **do not rebuild**:
- `app/api/meta/data-deletion/route.ts` — the Meta `signed_request` data-deletion callback (Phase 6.1)
- `app/data-deletion-status/page.tsx` — the public status page (Phase 6.1)
- `supabase/migrations/037_meta_data_deletion_requests.sql`
- Graph API **v23.0** across `lib/integrations/meta-instagram.ts` and `whatsapp-cloud.ts` (was v18.0)
- Meta Human Agent tag support for manual replies outside the 24h window

**Instruction from founder:** when Phases 6–9 begin, FIRST re-audit each item against current
`main`, skip anything already done, and report *what was found vs what was built*. Earlier
audit statements ("no data deletion callback", "repo is uniformly v18.0") described
`rollback-test`, not `main`, and are stale.

Still genuinely open for Phase 6: verify the existing callback actually HMAC-verifies
`signed_request` against `META_APP_SECRET` and enqueues real deletion; deauthorize callback;
privacy/terms review.

---

## Deployment: two Vercel projects deploy from every push to origin/main

Confirmed from GitHub deployment records: a single push to `origin/main` triggers a Production
deploy on **both** `effora-ai-qh35` **and** `effora-ai`. Both are linked to
`leadflowaisystems/Effora-AI`. `.vercel/project.json` links this working copy to
`effora-ai-qh35` (`prj_pQYRrN9VfwX7dFrfiyB0QWx2m55P`).

A third and fourth project (`effora-ai-jmty`, `effora-ai-mu26`) deploy from the *other* repo,
`leadflowaisystems/EfforaAI` (remote `neworigin`).

**Recommendation (defer the decision, not the awareness):** treat **`effora-ai-qh35` as
canonical** — it is the one this repo is linked to, the one `www.effora.co.in` should point at,
and the one every diagnostic in this program has targeted. Before pausing the duplicate,
confirm which project owns the `www.effora.co.in` domain — pausing the domain-owning project
would take the site down. Once confirmed: pause or delete `effora-ai`, and decide whether
`neworigin`/`EfforaAI` is a live mirror or dead weight. Doing this now saves double build
minutes and removes the risk of env vars drifting between two "production" apps.
*Effort: 20 min, once the domain owner is confirmed.*

---

## Deferred during Phase 3 (Day-1 client experience)

Copy that is Instagram- or coach-centric but **NOT** a trivial swap — left alone deliberately:

- **ManyChats hub** (`app/(app)/org/[orgSlug]/manychats/manychats-client.tsx:541`) — the entire
  feature is Instagram/ManyChat-specific. Re-framing the copy without re-framing the feature
  would be misleading. Decide the feature's fate first.
- **Compliance consent modal** (`components/compliance/connect-compliance-button.tsx:17,125,133`)
  — legally-worded consent text shown before connecting a channel. Already channel-conditional
  and correct. Changing consent wording needs deliberate review, not a find-and-replace.
- **Process/SOP view** (`components/process/process-view.tsx:358`, "Open Instagram → go to that
  person's DM") — an Instagram-specific runbook step; correct as written.
- **CRM Instagram channel UI** (`components/crm/crm-view.tsx`, ~10 sites) — functional channel
  selector and handle field, not marketing copy. Correct as-is.
- **Reply assistant "Instagram handle" field** (`components/assistant/reply-assistant.tsx:119`)
  — functional input.

The dashboard funnel label "DMs received" was changed to "Enquiries" — note this is also *more
accurate*, since the underlying `dms_received` metric counts both WhatsApp and Instagram inbound.

---

## Deferred by explicit scope rule

- **Instagram signature root-cause debugging** — Phase 7.2 will scope it; only implemented if <2h and zero-risk.
- **Tests / CI** — repo has zero test files and only an `npm audit` workflow. Post-revenue.
- **`sequences` table** — dead table, no code queries it. Ghost revival covers client #1's nurture need.
- **Voice / missed-call handling** — no code exists. Out of the WhatsApp-first path.
- **Graph API v18.0 → current** — 7 occurrences; v18.0 silently falls forward. Not urgent.

---

---

## AI auto-reply loop latency — options if measurement shows >8s

**Status: instrumented, not yet measured.** `[ai-timing]` lines are now emitted from
`lib/inngest/functions/on-whatsapp-message-received.ts` with per-stage deltas plus
`e2e_from_event` (Inngest event timestamp → send complete). Real p50 needs production
traffic; nothing here should be built until those numbers exist.

**Code-derived estimate (NOT a measurement):** WhatsApp inbound → delivered reply is likely
**~3–6s p50**, dominated by the 70B draft call. Rough per-stage shape:

| Stage | Est. | Source |
|---|---|---|
| Webhook pre-200 (no Graph call on WA inbound) | 0.3–0.6s | ~4 sequential Supabase round-trips |
| Inngest dispatch → function start | 0.1–0.5s | Inngest cloud round-trip |
| `load-context` | 0.2–0.4s | 4 parallel reads + Cal.com link |
| `qualify` (llama-3.1-8b-instant, 120 tok, temp 0) | 0.3–0.8s | `lib/ai.ts` |
| `draft` (llama-3.3-70b-versatile, 320 tok, temp 0.72) | 1–3s | `lib/ai.ts` — **dominant cost** |
| WA Graph send + DB writes | 0.4–1.0s | `deliverOutboundMessage` |

The WhatsApp function already merges qualify+draft+send into ONE Inngest step, so it avoids
3 step-boundary round-trips that `on-dm-received` still pays. That was a deliberate earlier
optimisation and should not be undone.

**Options to consider ONLY IF measured p50 > 8s** (none built, no new infrastructure required
for 1–4):

1. **Stream the draft into the inbox.** `draftReplyStream()` already exists at `lib/ai.ts:366`
   and returns a `ReadableStream`, but nothing in the UI consumes it. The owner would see the
   reply forming instead of waiting. Does not reduce delivery time, only perceived time.
2. **Send the qualification result before the draft finishes.** Update the lead's stage and
   fire the hot-lead push as soon as `qualify` returns, so the owner is alerted ~1–3s earlier
   than the reply. (Partly done already — the hot-lead notification is its own step.)
3. **Shorten the draft.** `max_tokens: 320` at temp 0.72 is the single largest lever; 200 tokens
   would cut generation time roughly proportionally. Cheap to try, costs reply richness.
4. **Skip the 70B for warm leads.** Use the 8B model for warm and reserve 70B for hot only.
   Roughly a 3–5x speedup on the majority path, at some quality cost.
5. **A faster model** (e.g. a smaller Llama on Groq). Requires re-tuning prompts.

Explicitly NOT recommended: adding a queue, a warm-pool, or a second provider — all are new
infrastructure and out of scope.

---

## Phase 4 requirement (not deferred — must be built)

`scripts/demo-seed.ts` must also configure the demo org's **Razorpay webhook secret (test mode)**,
otherwise the payment step of the demo dies on the new fail-closed gate
(`app/api/webhooks/razorpay/[orgId]/route.ts` → 401 when no secret is stored).
`DEMO_SCRIPT.md` must carry the exact Razorpay dashboard steps to obtain that secret.

---

*Last updated: Phase 3.*
