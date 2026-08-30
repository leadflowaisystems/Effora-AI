# SPRINT REPORT — Part 2, Meta Review Pack

**Scope:** Phases 6–9, run under the re-scope rule (audit `main` first, build only gaps).
**Baseline:** `0ea730e` · **Head:** `af5992a`
**Companion doc:** [docs/META_REVIEW.md](docs/META_REVIEW.md) — the actual submission runbook.

---

## 1. THE HEADLINE FINDING

The re-scope rule paid for itself immediately.

**The data-deletion callback existed and its cryptography was already correct** — better than I
would have written from scratch. It verifies `signed_request` against `META_APP_SECRET` using
`timingSafeEqual` with a length guard, decodes base64url properly, splits on the **first** `.` only
(a subtle detail most implementations get wrong), and rejects any non-HMAC-SHA256 algorithm.
Rebuilding it would have been pure waste.

**But it never deleted anything.** Requests were recorded as `status: "pending"` and *nothing in the
entire codebase ever processed them* — only two references existed: the insert, and the status page
read. The confirmation code Meta received resolved to a promise that could never be kept. A reviewer
testing the deletion flow would have seen "Pending" forever.

That is the single most likely App Review rejection in this codebase, and it is now fixed.

---

## 2. FOUND vs BUILT

| | Item | Outcome |
|---|---|---|
| **FOUND** | Data-deletion endpoint + HMAC verification | Correct as-is — documented, not touched |
| **FOUND** | Status page, migration `037`, Graph v23.0, privacy + terms pages | Present |
| **FOUND** | Permission-family consistency | Already uniform (Facebook Login). The Instagram-Login references lived only in the `debug-token` route, deleted by `d4c17e1`. **No refactor needed** — Phase 7.1 required zero code |
| **BUILT** | Real deletion worker | `lib/inngest/functions/on-meta-data-deletion.ts` — cascades across all orgs, stops sequences first, scrubs identity, marks `completed` |
| **BUILT** | Deauthorize callback | `app/api/meta/deauthorize/route.ts` — did not exist at all |
| **BUILT** | Privacy policy fixes | Inngest added to the processor table (undisclosed processor = review flag), dead `/security` link removed, Gmail contact flagged |
| **BUILT** | Submission runbook | `docs/META_REVIEW.md` — permission-mapped Graph inventory, verbatim use-case text, screencast script, go/no-go gates |
| **NOT BUILT** | Instagram root-cause fix | Fails the <2h zero-risk bar — see §5 |
| **NOT BUILT** | WhatsApp Embedded Signup | Wrong shape for done-for-you; recorded in `DEFERRED.md` |

**Verified:** `tsc --noEmit` clean; eslint clean on every new and changed file. The privacy page's
10 pre-existing `react/no-unescaped-entities` warnings are unchanged (10 before, 10 after).

---

## 3. YOUR EXACT META DASHBOARD ACTIONS

All at <https://developers.facebook.com/apps> → your app.

| # | Where | Action |
|---|---|---|
| 1 | **Settings → Basic → Deauthorize Callback URL** | Paste `https://www.effora.co.in/api/meta/deauthorize` |
| 2 | **Settings → Basic → User Data Deletion** | Choose **"Data Deletion Callback URL"** (not the instructions-URL option) and paste `https://www.effora.co.in/api/meta/data-deletion` |
| 3 | **Settings → Basic** | Confirm Privacy Policy URL = `/privacy`, Terms = `/terms` |
| 4 | **Settings → Basic** | Upload a 1024×1024 app icon; set category to Business/Productivity |
| 5 | **Settings → Basic** | Change the contact email off Gmail to `privacy@effora.co.in` (also update `CONTACT` in `app/privacy/page.tsx`) |
| 6 | **Business Verification** | Complete it. Advanced Access is not granted without it — this is usually the long pole |
| 7 | **Use Cases → Facebook Login for Business → your config** | Confirm the configuration requests the Facebook-Login family only, and that **no Instagram-Login product is also enabled** |
| 8 | **App Dashboard test tool** | Fire one test data-deletion request, then confirm `/data-deletion-status?id=<code>` flips **Pending → Completed** |
| 9 | **App Review → Permissions and Features** | Request `whatsapp_business_messaging` + `whatsapp_business_management`, pasting the use-case text from META_REVIEW.md §4 |

Also required outside the Dashboard: a reviewer test account (META_REVIEW.md §6) and the screencast
(§5). **Do not request `instagram_manage_insights`** — it has zero code implementation.

---

## 4. HONEST REJECTION RISKS + MITIGATIONS

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Deletion callback untested against a live Meta request.** Built and type-clean, but no Meta credentials were available here | **High impact if broken** | Action #8 above. Do this before submitting — it is a 2-minute check that de-risks the most likely rejection |
| **Business Verification incomplete** | High | Start it now; it gates everything and can take days |
| **Reviewer can't reproduce the flow** — empty inbox, or login fails from outside India | Medium | META_REVIEW.md §6: dedicated test org, 2–3 seeded conversations, verified from a clean browser profile |
| **Gmail contact address** | Medium | Action #5 |
| **Both Instagram products enabled in the Dashboard** — the original source of the permission-family ambiguity | Medium | Action #7 |
| **Submitting Instagram while its webhook 401s real traffic** | High if attempted | Explicit NO-GO gate in META_REVIEW.md §8. Ship WhatsApp alone first |
| **Reviewer reads "AI replies" as automated unsolicited messaging** | Medium | The use-case text and screencast both foreground **human approval before send**. Show the edit step on camera |
| **24-hour window confusion** — reviewer messages, waits a day, replies fail | Low-medium | Expected WhatsApp behaviour; the app now surfaces it as "Not sent — 24h window expired" with a Retry, which reads as correct handling rather than a bug |

---

## 5. WHY THE INSTAGRAM FIX WAS NOT IMPLEMENTED

Phase 7.2 allowed implementation only if under 2 hours **and** zero-risk. It fails both.

The diagnosed cause is a credential-resolution inversion: OAuth (which mints the token that
*creates* the subscription) resolves `meta_byo → platform_settings → env`, while the webhook (which
*verifies*) resolves `env → platform_settings` and never reads `meta_byo`.

But **we still do not know which Meta App actually owns the live subscription** — the evidence
packet at `_gate0/EVIDENCE_PACKET.md` was prepared and never run. Any change now is a guess that
could just as easily entrench the bug, and it touches shared credential code used by the OAuth
connect and callback paths.

META_REVIEW.md §9 gives a **35-minute, entirely read-only** sequence that produces a definitive
answer — a SQL block returning identifiers and booleans only, compared against production
`META_APP_ID`. If they differ, the fix is configuration, not code. Run that before writing anything.

Meanwhile the webhook is fail-closed and safe: invalid signatures are rejected with a 401 in every
built deployment, and the debug bypass is inert.

---

## 6. GO / NO-GO FOR SUBMISSION

**GO for the WhatsApp submission — once actions #1–#8 are done, and #8 in particular.**

The compliance surface is now genuinely complete rather than nominally complete: the deletion
callback deletes, the deauthorize callback exists, the disclosed processor list matches reality, and
there are no dead links on a public policy page. The permission story is coherent and evidenced, and
the Graph call inventory in META_REVIEW.md §3 means you can answer any reviewer question about why a
permission is needed by pointing at a line of code.

**NO-GO for the Instagram submission** until its webhook accepts real traffic. Submitting a broken
integration is how apps get rejected and how re-review gets slower.

**The one thing I would not skip:** fire a test deletion request from the Dashboard and watch the
status page flip to Completed. Everything else in this pack is verifiable by reading; that one is
not, and it is the piece a reviewer will actually test.
