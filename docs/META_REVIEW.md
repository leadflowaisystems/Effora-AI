# META APP REVIEW — RUNBOOK

**App:** Effora AI · **Production:** https://www.effora.co.in
**Strategy:** submit **WhatsApp first**. Instagram only after its webhook root cause is resolved.
**Audited against:** `main` @ `0ea730e`

> Everything in this document describes what the app **actually does today**. No aspirational
> features. If a reviewer follows the scripts below, what they see will match what is written.

---

## 0. AUDIT RESULT — FOUND vs BUILT

Part 2 was scoped before we discovered `main` already contained work the plan assumed missing.
This is what the audit found, and what was actually built as a result.

| Item | Status | Detail |
|---|---|---|
| Data-deletion callback — endpoint | **FOUND** | `app/api/meta/data-deletion/route.ts` already existed (commit `d4c17e1`) |
| — HMAC verification | **FOUND, and genuinely correct** | Verifies `signed_request` against `META_APP_SECRET` (with `platform_settings` fallback) using `timingSafeEqual` with a length guard, correct base64url decoding, splits on the **first** `.` only, and rejects any `algorithm` that isn't HMAC-SHA256. Nothing to improve. |
| — returns Meta's required response | **FOUND** | Returns `{ url, confirmation_code }` |
| — records the request | **FOUND** | `meta_data_deletion_requests` (migration `037`) |
| — **actually deletes data** | ❌ **NOT FOUND → BUILT** | Rows were inserted as `status: "pending"` and **nothing ever processed them**. Only two references existed in the entire codebase: the insert, and the status page read. Status could never become `completed`, so the confirmation code resolved to a promise that was never kept. |
| Public status page | **FOUND** | `app/data-deletion-status/page.tsx` resolves a code to its status |
| Migration `037` | **FOUND** | Table + deny-all RLS |
| Graph API v23.0 | **FOUND** | Already bumped from v18.0 across `meta-instagram.ts` and `whatsapp-cloud.ts` |
| **Deauthorize callback** | ❌ **NOT FOUND → BUILT** | No `deauthorize` reference existed anywhere |
| Privacy policy page | **FOUND** | `app/privacy/page.tsx` — good structure, three specific gaps fixed (below) |
| Terms page | **FOUND** | `app/terms/page.tsx` |
| Permission-family consistency | **FOUND — already consistent** | See §2. No refactor was needed. |

### What was built

1. **`lib/inngest/functions/on-meta-data-deletion.ts`** — the missing deletion worker. Finds every
   lead across every org matching the Meta-scoped user id (`ig_<id>` and the bare id), then cascades:
   stops active `sequence_runs` **first** so no automated message escapes mid-delete, soft-deletes
   conversations and bookings, scrubs the lead's identity (name, phone, Instagram handle,
   `external_id`), and marks the request `completed` so the status URL tells the truth.
   Payments are retained — see §1.
   The callback now fires `meta.data_deletion_requested` after recording the row.
2. **`app/api/meta/deauthorize/route.ts`** — same `signed_request` HMAC verification, then marks the
   matching `meta_instagram` integration inactive and strips its stored tokens.
3. **Privacy policy fixes** — added **Inngest** to the third-party processor table (it processes every
   event payload and was undisclosed), removed a dead `/security` link (that route does not exist),
   and flagged the Gmail contact address for founder review.

---

## 1. WHY DELETION RETAINS PAYMENT ROWS

`payments.lead_id` is `NOT NULL REFERENCES leads(id) ON DELETE CASCADE`. Hard-deleting a lead would
therefore destroy that person's entire payment history — amounts, Razorpay order and payment ids,
timestamps — and the `NOT NULL` constraint makes detaching impossible. Those rows are financial
records that reconcile against Razorpay settlements and are needed for accounting long after
personal data should be gone.

The deletion worker separates the two concerns: the lead **row** is retained so referential
integrity and revenue reporting stay intact, while the lead's **identity** is erased in place. A
reviewer asking "what happens to my data" gets an accurate answer: every message, conversation,
booking and identifying field is removed; an anonymous financial record remains. This is the
standard "erasure with a lawful-retention carve-out" shape and is disclosed in the privacy policy.

---

## 2. PERMISSION FAMILY DECISION (Phase 7.1)

Meta offers two mutually exclusive Instagram products:

- **Instagram API with Facebook Login** — `instagram_basic`, `instagram_manage_messages`, plus
  `pages_*`. Page-centric; sends via `/{page_id}/messages`.
- **Instagram API with Instagram Login** — `instagram_business_basic`,
  `instagram_business_manage_messages`. Has its **own Instagram App Secret**, separate from the
  Facebook App Secret.

### Decision: **Instagram API with Facebook Login.**

The code implements this unambiguously, and an audit of current `main` confirms the codebase is
**already consistent** — no refactor was required:

| Evidence | Location |
|---|---|
| OAuth dialog is the **Facebook** dialog | `app/api/auth/meta/connect/route.ts:62` — `https://www.facebook.com/v18.0/dialog/oauth` |
| Token exchange on `graph.facebook.com` | `lib/integrations/meta-instagram.ts:57` |
| Pages-then-IG discovery | `meta-instagram.ts:115` — `/me/accounts?fields=…instagram_business_account{…}` |
| IG DMs sent via the **Page** | `meta-instagram.ts:258` — `POST /{page_id}/messages` |
| `graph.instagram.com` / `api.instagram.com` | **zero occurrences** |
| Instagram-Login permission family | **zero occurrences on `main`** — the only references lived in the `debug-token` route, deleted by `d4c17e1` |

⚠️ **One thing the repo cannot tell us:** OAuth sends `config_id` and **no `scope`**
(`connect/route.ts:58-67`), so the permission set actually granted lives entirely in the Meta App
Dashboard's Business Login configuration (`config_id 1303123918594190`). Before submitting,
confirm in the Dashboard that the configuration requests the Facebook-Login family listed in §3 and
that **no** Instagram-Login product is also enabled — having both is what produced the original
ambiguity.

---

## 3. GRAPH API CALL INVENTORY → REQUIRED PERMISSIONS (Phase 8.1)

Every Graph call the application makes:

| # | Call | Where | Purpose | Permission required |
|---|---|---|---|---|
| 1 | `POST /{phone_number_id}/messages` | `whatsapp-cloud.ts:28` | Send a WhatsApp text reply | `whatsapp_business_messaging` |
| 2 | `POST /{phone_number_id}/messages` (template) | `whatsapp-cloud.ts:77` | Send an approved template outside the 24h window | `whatsapp_business_messaging` |
| 3 | `GET /{phone_number_id}?fields=display_phone_number,verified_name` | `whatsapp-cloud.ts:100` | Validate the token and read the display number at connect time | `whatsapp_business_management` |
| 4 | `GET /oauth/access_token` | `meta-instagram.ts:57,83,376` | OAuth code exchange, long-lived token, refresh | none (app credentials) |
| 5 | `GET /me/accounts?fields=…instagram_business_account{…}` | `meta-instagram.ts:115` | List Pages and the linked IG Business Account | `pages_show_list`, `instagram_basic` |
| 6 | `GET /me/businesses?fields=whatsapp_business_accounts{…}` | `meta-instagram.ts:148` | Discover the WABA during connect | `whatsapp_business_management`, `business_management` |
| 7 | `POST /{ig_account_id}/subscribed_apps` (`subscribed_fields=messages`) | `meta-instagram.ts:208` | Subscribe the IG account to message webhooks | `instagram_manage_messages` |
| 8 | `POST /{page_id}/messages` | `meta-instagram.ts:258` | Send an Instagram DM | `instagram_manage_messages`, `pages_messaging` |
| 9 | `GET /{ig_user_id}?fields=id,name,username` | `meta-instagram.ts:334` | Resolve the sender's display name | `instagram_manage_messages` |

**WhatsApp uses only `whatsapp_business_messaging` and `whatsapp_business_management`** (calls 1–3,
plus 6 at connect time) — confirmed, nothing broader. Graph version is **v23.0** throughout.

---

## 4. USE-CASE TEXT FOR THE REVIEW FORM (Phase 9.1)

Copy these verbatim. They describe only shipped behaviour.

### `whatsapp_business_messaging`

> Effora AI is a lead-management tool for coaching institutes in India. When a parent or student
> sends an enquiry to the institute's WhatsApp Business number, Effora AI records it, and the
> institute owner reviews an AI-drafted reply and sends it from their own inbox. This permission is
> used solely to send the owner's replies to people who messaged them first, and to send booking
> confirmations, class reminders and fee links to those same people. We do not send unsolicited
> messages and we do not message anyone who has not contacted the institute.

### `whatsapp_business_management`

> Used at setup only. When an institute connects its WhatsApp Business Account, Effora AI validates
> the supplied phone number ID and access token and reads back the display phone number and verified
> name so the owner can confirm they connected the correct number. We do not create, modify or
> delete phone numbers, templates or business assets.

### `instagram_manage_messages` *(Instagram submission — later)*

> When a prospective student sends an Instagram DM to the institute's business account, Effora AI
> receives it via webhook, records it in the institute's inbox, and drafts a reply for the owner to
> review. This permission is used to receive those DMs, resolve the sender's display name so the
> owner knows who they are talking to, and send the owner's reply back to that same person.

### `instagram_basic` / `pages_show_list` *(Instagram submission — later)*

> Used at connection time only, to list the Facebook Pages the institute owner manages and identify
> the Instagram Business Account linked to the Page they choose, so their DMs can be routed to the
> correct workspace.

---

## 5. SCREENCAST SCRIPT (Phase 9.2)

The reviewer must see a complete round trip. Record in one take, ~3 minutes, no cuts.

1. **Log in** at `https://www.effora.co.in` with the review test account (§6). Show the inbox.
2. **Show the connection** — Settings → WhatsApp, with the connected Business number visible.
3. **Receive a real message** — on a second phone, WhatsApp the connected number:
   *"Hello, I want to know the fees for the JEE batch."* Show it appearing in the inbox live.
4. **Show the AI draft** — the lead is scored and a suggested reply appears. State on camera that
   this is a suggestion and nothing has been sent yet.
5. **Human approval** — edit a word in the draft to prove it is editable, then click send.
6. **Show delivery** — cut to the second phone showing the reply received in WhatsApp.
7. **Show the data-deletion path** — open `https://www.effora.co.in/data-deletion`, then the
   privacy policy at `/privacy`, showing the retention and deletion sections.

**Do not show:** the demo org, seeded data, or the Instagram surfaces.

---

## 6. REVIEWER TEST CREDENTIALS (Phase 9.3)

Meta requires working credentials that need no real-world setup.

- Create a dedicated org, e.g. **"Review Test Institute"**, with a login the reviewer can use.
  Provide the email and password in the submission's "App Verification Details" field.
- Connect a WhatsApp Business number to that org that you can message during review.
- Seed **two or three** realistic conversations so the inbox is not empty on first load. Do **not**
  point them at the demo org — that is for sales, and its content is obviously synthetic.
- Confirm the account can log in from a clean browser profile with no prior session.
- Meta reviewers are outside India: verify the login flow works without an Indian IP or phone.

---

## 7. DASHBOARD CHECKLIST BEFORE SUBMITTING (Phase 9.4)

| Setting | Value | Status |
|---|---|---|
| Privacy Policy URL | `https://www.effora.co.in/privacy` | ✅ live |
| Terms of Service URL | `https://www.effora.co.in/terms` | ✅ live |
| User Data Deletion — **Callback URL** | `https://www.effora.co.in/api/meta/data-deletion` | ✅ built, now performs real deletion |
| Deauthorize Callback URL | `https://www.effora.co.in/api/meta/deauthorize` | ✅ newly built — **paste this in** |
| App Icon (1024×1024) | — | ⬜ founder to upload |
| App Category | Business / Productivity | ⬜ founder to set |
| Business Verification | — | ⬜ **must be Verified before Advanced Access is granted** |
| Data Use Checkup | — | ⬜ complete if prompted |
| Contact email | ⚠️ currently a Gmail address | ⬜ **change to `privacy@effora.co.in`** |

**Where to paste the URLs:** App Dashboard → **Settings → Basic** → *User Data Deletion* (choose
"Data Deletion Callback URL", not the instructions-URL option) and *Deauthorize Callback URL*.

---

## 8. SUBMISSION ORDER + GO / NO-GO (Phase 9.2)

### Submission 1 — WhatsApp

**GO when all are true:**
- [ ] Business Verification is **Verified**
- [ ] Deauthorize + data-deletion callback URLs pasted into the Dashboard
- [ ] Contact email changed off Gmail
- [ ] A real message → AI draft → human send round trip works on the review test account
- [ ] `SMOKE_TEST.md` Parts 1–5 pass
- [ ] Screencast recorded per §5

**NO-GO if:** Business Verification is pending, or the WABA has no verified display name.

### Submission 2 — Instagram (only after §9)

**GO when all are true:**
- [ ] WhatsApp submission approved
- [ ] Instagram webhook signature root cause **resolved and verified**, with the fail-closed handler
      accepting real Meta traffic
- [ ] Dashboard confirms exactly one Instagram product (Facebook Login) is enabled
- [ ] A real IG DM → draft → send round trip works

**NO-GO if:** the Instagram webhook still 401s real traffic. Submitting a broken integration is how
apps get rejected and re-review gets slower.

---

## 9. INSTAGRAM ROOT CAUSE — SCOPED, NOT IMPLEMENTED (Phase 7.2)

**Fail-closed confirmed.** `app/api/webhooks/meta/instagram/route.ts` rejects any request with an
invalid or missing signature with a 401 in every built deployment; the debug bypass is inert;
`META_APP_SECRET` missing is also a 401. Verified after the Part 1 merge.

**The diagnosed cause** is a credential-resolution **inversion**: OAuth — which mints the token that
*creates* the webhook subscription — resolves `meta_byo → platform_settings → env`
(`lib/meta-config.ts:25-79`), while the webhook — which *verifies* the signature — resolves
`env → platform_settings` and never reads `meta_byo` (`instagram/route.ts:78-100`). If those two
disagree about which Meta App is authoritative, HMAC fails 100% of the time.

### Assessment against the <2h zero-risk bar: **FAILS. Not implemented.**

Two reasons:

1. **We still do not know which app owns the subscription.** The evidence packet at
   `_gate0/EVIDENCE_PACKET.md` was prepared but never run, so any fix would be a guess. Changing
   credential-resolution order without knowing the answer could just as easily entrench the bug.
2. **The change touches shared credential-resolution code** used by the OAuth connect and callback
   paths. That is not zero-risk regardless of how small the diff looks.

### Recommended sequence (do not start with code)

| Step | Effort | Risk |
|---|---|---|
| 1. Run `_gate0/EVIDENCE_PACKET.md` Part 1 (a read-only SQL block returning identifiers and booleans only) | 15 min | none |
| 2. Compare `platform_settings.meta_app_id` and any `meta_byo.app_id` against production `META_APP_ID` | 5 min | none |
| 3a. **If they differ** → the fix is configuration, not code: align the app id. | 15 min | low |
| 3b. **If they match** → the mismatch theory is falsified; the cause is the Instagram-Login App Secret question in §2, settled by Dashboard inspection. | 15 min | none |
| 4. Only then, if code is genuinely required, unify the resolution order behind `getMetaConfig` | ~1h | medium — needs re-testing the OAuth connect flow |

Total to a *known* answer: **~35 minutes of read-only work.** Do that before writing any code.

---

## 10. HONEST NOTES FOR THE SUBMISSION

- The Instagram integration is currently **not receiving traffic** by design. Do not claim otherwise
  in the WhatsApp submission; it is not relevant to it.
- The data-deletion callback now performs real deletion, but **this has not been exercised
  end-to-end against a live Meta request** — no credentials were available to test it. Trigger one
  from the App Dashboard's test tool and confirm the status page flips from Pending to Completed
  before submitting.
- `instagram_manage_insights` is referenced in older docs but has **zero code implementation**.
  Do not request it.
