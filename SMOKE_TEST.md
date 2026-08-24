# SMOKE TEST — Client #1 Go-Live

Full manual end-to-end check before a real coaching institute starts paying. Run it **in order**
against the real client org (not the demo org). Every step states the expected result — if one
fails, stop and fix it before continuing, because later steps depend on earlier ones.

**Time:** ~45 minutes, excluding Meta wait times.
**You need:** the client's WhatsApp Business number, a second phone to play the parent, the
client's Razorpay account, and founder access to the app.

---

## PART 0 — PRE-FLIGHT (do these first; nothing works without them)

| # | Step | Expected result |
|---|---|---|
| 0.1 | Supabase SQL Editor: run `039_founder_account_correction.sql` | No error. `select email from founder_accounts;` includes `omnaarkar7@gmail.com` |
| 0.2 | Supabase SQL Editor: run `040_push_subscriptions_reconcile.sql` | No error. `user_push_subscriptions` has an `updated_at` column and a UNIQUE constraint on `endpoint` alone |
| 0.3 | Vercel → Settings → Environment Variables: **remove** `META_WEBHOOK_DEBUG_BYPASS_SIGNATURE` from Production, then **redeploy** | Variable gone from the list. (Code already ignores it in any built deployment, but it should not exist.) |
| 0.4 | Vercel: confirm `FOUNDER_EMAILS` contains `omnaarkar7@gmail.com` | Present. If you edit it, redeploy. |
| 0.5 | Vercel: confirm `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` are all set | All present |
| 0.6 | Logged in as founder, open `/api/admin/diagnostics` | JSON with `meta_app_secret: true`, `encryption_key: true`, `supabase_service: true`, `groq: true`. **Booleans only — no secret values.** `warnings` array should be empty |

---

## PART 1 — ORG + WHATSAPP CONNECT

| # | Step | Expected result |
|---|---|---|
| 1.1 | Create the client's org (or open it) and complete onboarding | Org appears in the switcher; org slug is set |
| 1.2 | Open `/org/<slug>/dashboard` **before** connecting anything | You see the **"Almost ready"** panel with a checklist — *not* a grid of ₹0 tiles and flat charts. This is the day-1 view from Phase 3 |
| 1.3 | Settings → WhatsApp: enter WABA ID, Phone Number ID, access token | Toast shows `Connected: +91…` with the real display number |
| 1.4 | Return to `/org/<slug>/dashboard` | Panel now reads **"Live & listening"** with a pulsing dot, and the WhatsApp row shows the connected number |
| 1.5 | In the Meta App dashboard, confirm the WhatsApp webhook points at `https://www.effora.co.in/api/webhooks/whatsapp` and the `messages` field is subscribed | Subscribed, callback verified |

---

## PART 2 — INBOUND ENQUIRY → LEAD CAPTURE

| # | Step | Expected result |
|---|---|---|
| 2.1 | From the second phone (a number that has **never** messaged this WABA), WhatsApp: *"Namaste, JEE batch ka fees kya hai?"* | Message appears in `/org/<slug>/inbox` within a few seconds, **no refresh needed** |
| 2.2 | Check the lead in the thread header | Shows the sender's WhatsApp profile name, not a bare number |
| 2.3 | Open `/org/<slug>/crm` | The same lead is listed, with **a phone number populated** (this was the Phase 4.5 gap fix) and stage `cold` |
| 2.4 | **Non-text capture:** from the same second phone send a **photo** (no caption) | A new message appears reading **"📷 Photo"**. Critically, if this had been the *first* contact, the lead would still have been created — previously non-text messages were dropped entirely |
| 2.5 | Vercel logs, filter `[wa-webhook]` | `✓ message lead=… conv=… type=image`, and for the photo: `non-text message (image) — lead captured, AI pipeline skipped` |

---

## PART 3 — AI QUALIFY + DRAFT

| # | Step | Expected result |
|---|---|---|
| 3.1 | Wait for the AI to process the text message from 2.1 | Lead stage moves from `cold` to `warm` or `hot`; a score appears in the thread header |
| 3.2 | Check the thread | An AI draft appears (or an auto-sent reply if `auto_send_replies` is on) in the institute's voice |
| 3.3 | Vercel logs, filter `[ai-timing]` | A line like `[ai-timing] wa total=…ms e2e_from_event=…ms qualify=…ms draft=…ms deliver_and_persist=…ms`. **Record these numbers** — this is the p50 baseline that was never measurable before |
| 3.4 | If total consistently exceeds ~8s | Do not fix live. See `DEFERRED.md` → "AI auto-reply loop latency" for the five options |

---

## PART 4 — OWNER NOTIFICATIONS

| # | Step | Expected result |
|---|---|---|
| 4.1 | On the client's phone, open the app in **Chrome (Android)** or **Safari (iOS 16.4+)**. On iOS you must Share → *Add to Home Screen* and open from that icon — iOS blocks web push in a normal tab | Slim "enable notifications" banner appears |
| 4.2 | Tap Enable → Allow | `select endpoint from user_push_subscriptions;` returns a row for this org |
| 4.3 | From the second phone, message from a **brand-new** number | Push arrives: **"New enquiry on WhatsApp: <name>"** with the message preview |
| 4.4 | Send a high-intent follow-up (*"admission lena hai, fees bhej dijiye"*) | Push arrives: **"🔥 Hot lead: <name>"**. It fires only on the transition into hot, so a second hot message must **not** re-ping |
| 4.5 | Tap either notification | Opens **that exact conversation**, not the inbox root |

---

## PART 5 — MANUAL SEND (Phase B latency work)

| # | Step | Expected result |
|---|---|---|
| 5.1 | Type a reply in the thread and hit send | The bubble appears **instantly** with a "Sending…" state, and the composer clears immediately. It must not sit disabled with your text in it |
| 5.2 | Watch the bubble | Within ~1–2s the "Sending…" label is replaced by a timestamp |
| 5.3 | Check the second phone | The message actually arrived on WhatsApp |
| 5.4 | Vercel logs, filter `[send-timing]` | `total=…ms channel=whatsapp_cloud parse_body=… auth_and_conversation=… lead_lookup=… graph_send=… message_insert=…`. **`graph_send` should dominate** |
| 5.5 | **Failure path:** temporarily break delivery (e.g. wait out the 24h window, or use a number that never messaged you) and send | Bubble shows **"Not sent"** in red with the reason and a **Retry** link. Clicking Retry refills the composer with that text |
| 5.6 | Send two messages quickly in a row | Both send. The composer must not lock between them |

---

## PART 6 — BOOKING

| # | Step | Expected result |
|---|---|---|
| 6.1 | Connect Cal.com in onboarding/settings | Calendar row on the dashboard panel turns Active |
| 6.2 | Ensure a hot lead's reply contains the Cal.com link, then book a slot from the second phone | Booking appears against the lead in CRM and on `/org/<slug>/bookings` |
| 6.3 | Owner's phone | Push: **"📅 Call booked: <name>"** with the IST date/time |
| 6.4 | Check Inngest dashboard for `on-booking-created` | Function running, with `sleepUntil` steps scheduled for 24h-before and 1h-before |

---

## PART 7 — PAYMENT (fail-closed gate)

| # | Step | Expected result |
|---|---|---|
| 7.1 | Settings → Payments: enter Razorpay Key ID, Key Secret, **and Webhook Secret** | Saved. Re-opening the page shows the webhook field with the "Saved — enter a new value to replace" placeholder |
| 7.2 | In the Razorpay dashboard add the webhook `https://www.effora.co.in/api/webhooks/razorpay/<orgId>` with event `payment_link.paid`, using the same secret string | Webhook created |
| 7.3 | Generate a payment link from a lead and pay it (test mode) | Payment status flips to `paid`; lead stage moves to `won` |
| 7.4 | Owner's phone | Push: **"💰 Payment received: ₹…"** |
| 7.5 | Razorpay dashboard → Webhooks → recent deliveries | **200s, not 401s.** A 401 means the webhook secret is missing or mismatched — this is the fail-closed gate from Phase 1 doing its job |
| 7.6 | **Negative test:** temporarily clear the org's webhook secret and replay a webhook | Razorpay shows 401; Vercel logs show `[razorpay-webhook] REJECTED org=… reason=no_webhook_secret_configured`. Restore the secret afterwards |

---

## PART 8 — CRM + EXPORT

| # | Step | Expected result |
|---|---|---|
| 8.1 | Open `/org/<slug>/crm` | All leads listed with name, phone, channel, score, stage |
| 8.2 | Open a lead's detail view | Timeline shows conversations, bookings and payments |
| 8.3 | Click **Export CSV** on a lead | CSV downloads with that lead's data |
| 8.4 | Export the full CRM list | CSV downloads and opens correctly in Excel/Sheets |

---

## PART 9 — LEAD LIFECYCLE (Phase 4.5)

| # | Step | Expected result |
|---|---|---|
| 9.1 | In a thread, open the **⋯** menu (top right) | Two options: *Remove from inbox* and *Delete lead* |
| 9.2 | Click **Remove from inbox** | Confirm dialog **names the lead** and states the lead stays in the CRM |
| 9.3 | Confirm | Thread disappears from the sidebar **immediately** (no refresh), and you are returned to the inbox |
| 9.4 | Check `/org/<slug>/crm` | The lead is **still there** with full history |
| 9.5 | From that same number, message again | The conversation **reopens** in the inbox with its previous history intact — not a duplicate thread. Vercel logs show `reopened archived conversation conv=…` |
| 9.6 | Open the ⋯ menu → **Delete lead** | Step 1 names the lead and lists exactly what is removed, and states payments are kept |
| 9.7 | Click Continue | Step 2 requires typing `DELETE`; the button stays disabled until it matches |
| 9.8 | Confirm | Toast reports how many follow-up sequences were stopped. Thread disappears; lead disappears from CRM |
| 9.9 | Check revenue: `/org/<slug>/dashboard` and `/org/<slug>/payments` | **Revenue totals are unchanged.** Payment rows still exist with their amounts, now without a name |
| 9.10 | Supabase: `select status from sequence_runs where lead_id = '<deleted lead>';` | Any previously `active` row is now `stopped` |
| 9.11 | **The critical one:** from the deleted number, message again | A **brand-new lead** is created with a fresh id, `cold` stage, score 0, and no old messages. No webhook error in logs |
| 9.12 | Confirm no automated message ever reaches a deleted lead | Vercel logs contain no `[deliverOutbound] BLOCKED` for a live lead; if a sequence did try, you'd see `BLOCKED — lead … is deleted` and no send |
| 9.13 | Repeat 9.6–9.8 from the **CRM lead view** ("Delete lead" button, top right) | Identical dialog wording and identical outcome |

---

## PART 10 — TENANT ISOLATION

| # | Step | Expected result |
|---|---|---|
| 10.1 | With a user who belongs to org A, open DevTools and call `DELETE /api/orgs/<ORG_B_ID>/leads/<ORG_B_LEAD_ID>` | **401 Unauthorized.** `assertMember` fails because there is no `org_members` row for org B |
| 10.2 | Repeat with a valid org A id but an org B lead id | **404 Lead not found** — the lead read is scoped by `org_id`, so it matches nothing |
| 10.3 | Confirm org B's lead is untouched | Still present with all data |

---

## SIGN-OFF

Client #1 is go-live ready when **every row above passes**, with these explicitly allowed to be
skipped:

- Anything Instagram-related — Instagram inbound is deliberately fail-closed and deferred
- Part 3.4 if AI timing is comfortably under 8s
- Part 7.6 if you would rather not disturb a working payment config

Record the `[ai-timing]` and `[send-timing]` numbers from 3.3 and 5.4 — they are the first real
latency baseline for this product.
