# DEMO SCRIPT — Effora AI

A repeatable 90-second live demo you can run in front of every prospect, from your own phone.

**The demo org:** *Ascent Academy, Pune* — `/org/ascent-academy-demo`
**Reset between prospects:** `npx tsx scripts/demo-reset.ts`

---

## ONE-TIME SETUP

### 1. Seed the demo org

Add to `.env.local` (values explained below):

```
DEMO_OWNER_EMAIL=omnaarkar7@gmail.com
DEMO_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
DEMO_RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
DEMO_RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxx
```

Then:

```bash
npx tsx scripts/demo-seed.ts
```

You must have logged into the app at least once with `DEMO_OWNER_EMAIL`, or the script can't
add you as owner and the org won't appear in your switcher.

### 2. Razorpay test-mode setup ⚠️ REQUIRED for the payment step

The Razorpay webhook is **fail-closed** since the Phase 1 security work: if no webhook secret
is stored for an org, `app/api/webhooks/razorpay/[orgId]/route.ts` returns **401** and the
payment is never marked paid. The demo's payment beat will silently do nothing without this.

**Get the API keys:**
1. Log in to <https://dashboard.razorpay.com>.
2. Toggle to **Test Mode** (switch at the top — the URL becomes `.../app/website-app-settings`
   with a "Test Mode" banner). Do not use Live keys for demos.
3. Go to **Account & Settings → API Keys → Generate Test Key**.
4. Copy the **Key Id** (`rzp_test_…`) → `DEMO_RAZORPAY_KEY_ID`.
   Copy the **Key Secret** (shown once) → `DEMO_RAZORPAY_KEY_SECRET`.

**Create the webhook and get its secret:**
5. Go to **Account & Settings → Webhooks → + Add New Webhook**.
6. **Webhook URL:**
   ```
   https://www.effora.co.in/api/webhooks/razorpay/<DEMO_ORG_ID>
   ```
   Get `<DEMO_ORG_ID>` from the seed script output, or:
   ```bash
   npx tsx -e "require('dotenv').config({path:'.env.local'});const{createClient}=require('@supabase/supabase-js');createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY).from('orgs').select('id').eq('slug','ascent-academy-demo').single().then(r=>console.log(r.data?.id))"
   ```
7. **Secret:** type any strong string you choose (Razorpay does not generate it for you).
   Put that same string in `DEMO_RAZORPAY_WEBHOOK_SECRET`.
8. **Active Events:** tick **`payment_link.paid`**. (Tick `payment.captured` too if you plan to
   demo order-based payments — see the known gap in `DEFERRED.md`.)
9. **Create Webhook**, then re-run `npx tsx scripts/demo-seed.ts` so the secret is stored
   encrypted against the demo org.

**Verify it took:** Settings → Payments on the demo org should show the Webhook Secret field
with the "Saved — enter a new value to replace" placeholder.

### 3. WhatsApp

The demo sends from **your own WhatsApp Business number** — the same one connected in
Settings → WhatsApp. You will message it from your personal phone, playing the parent.
No template approval is needed: your reply lands inside the 24-hour customer service window
that the prospect's inbound message opens.

---

## PRE-DEMO CHECKLIST (60 seconds, do this before every call)

- [ ] `npx tsx scripts/demo-reset.ts` — clean slate
- [ ] Open `/org/ascent-academy-demo/inbox` in a browser tab, logged in
- [ ] Second tab on `/org/ascent-academy-demo/dashboard`
- [ ] Personal phone in hand, WhatsApp open on the business number's chat
- [ ] **Delete the previous demo chat thread on your personal phone** — otherwise the
      prospect sees your last demo's messages
- [ ] Phone notifications ON and screen unlocked (for the owner-alert beat)
- [ ] Confirm the demo org's WhatsApp shows "connected" on the dashboard panel
- [ ] Silence other notifications / close unrelated tabs

---

## THE 90-SECOND FLOW

> **Framing line to open with:** *"This is a real coaching institute account. I'm going to be a
> parent messaging them right now — watch what happens on their side."*

**0:00–0:15 — The enquiry**
From your personal phone, WhatsApp the business number:

> *"Namaste, meri beti 11th me hai. JEE ke 2 year batch ka fees kya hai?"*

Switch to the browser. The message appears in the inbox in real time — no refresh.
**Say:** *"That's live. No refresh, no polling — it just arrives."*

**0:15–0:35 — AI qualifies and drafts**
The lead is scored and a reply is drafted in the institute's voice. The lead shows as **hot**.
**Say:** *"It's read the message, worked out this is a serious parent — fees question, specific
class, specific exam — and drafted a reply in the institute's own tone. The owner didn't type
anything."*

**0:35–0:50 — Owner is alerted**
Your phone buzzes: **"🔥 Hot lead: …"**. Hold the phone up.
**Say:** *"The owner gets this even if they're teaching. They don't have to sit watching an inbox."*

**0:50–1:10 — Human approves and sends**
Click into the drafted reply, tweak a word so they see it's editable, hit send.
The message appears **instantly** with a "Sending…" state, then settles.
**Say:** *"Nothing goes out without the owner's say-so. They stay in control — the AI just
removes the typing."*
Check your personal phone: the reply has arrived on WhatsApp.

**1:10–1:25 — Booking**
The hot-lead reply carries the booking link. Tap it on your phone, book a slot.
The booking appears against the lead, and confirmation + 24h/1h reminders are scheduled.
**Say:** *"Booked. They'll get a reminder a day before and an hour before, automatically."*

**1:25–1:30 — Payment + the close**
Show the fee link on the lead (or the already-paid Priya Sharma lead from the seed).
**Say:** *"And when the fee is paid, the owner gets that notification too — and the student
moves to 'won' on its own. Enquiry to admission, without anyone chasing."*

Switch to the dashboard tab to land the point: enquiries, bookings, fees collected — all real.

---

## THE 3 LIKELIEST FAILURE POINTS — AND THE RECOVERY MOVE

### 1. The AI reply takes longer than expected (3–6s is normal, occasionally more)
**Why:** the 70B draft model dominates the loop; a cold Vercel function adds to it.
**Recovery — talk through it, don't stare at it:** *"While that's drafting — this is the part
that normally costs the owner ten minutes and a lot of second-guessing."* Then land it when it
appears. Never say "it's usually faster"; that draws attention to the wait.
**Prevention:** send one throwaway message to the number 2 minutes before the call to warm the
function. Delete that thread from your phone afterwards.

### 2. The message doesn't arrive / delivery fails
**Why, most often:** the 24-hour window closed (no inbound from that number in 24h), or the
WhatsApp token expired.
**Recovery:** you will see it immediately — the bubble shows **"Not sent"** with a reason and a
**Retry** link. Use it as a feature, not a failure: *"See how it tells the owner straight away
rather than silently dropping it? WhatsApp only allows replies within 24 hours of the customer
messaging — that's Meta's rule, and we surface it."* Then continue the demo from the inbox side.
**Prevention:** the pre-demo checklist's inbound message opens a fresh 24h window.

### 3. The payment webhook doesn't mark the fee as paid
**Why:** the webhook secret isn't stored for the demo org (the fail-closed 401), or the webhook
URL has the wrong org id.
**Recovery:** don't debug live. Pivot to the **Priya Sharma** lead, which is seeded as already
paid: *"Here's what it looks like once a fee lands."* The story is identical and nothing looks
broken.
**Prevention:** step 2 above, plus check Razorpay Dashboard → Webhooks → your webhook → recent
deliveries show 200s, not 401s.

---

## RESET BETWEEN PROSPECTS

```bash
npx tsx scripts/demo-reset.ts
```

Restores the exact same 8 enquiries, 1 booking, 1 captured payment and 1 in-flight ghost
revival. The org, your membership, the voice profile and the Razorpay credentials are all
preserved — nothing to reconnect.

**Also delete the demo chat thread from your personal phone**, or the next prospect sees the
previous conversation. The script cannot do this for you.

---

## WHAT'S IN THE SEEDED DATA

| Lead | Stream | Stage | Notes |
|---|---|---|---|
| Priya Sharma | JEE 2-year | won | booked **and** paid ₹1,20,000 — your payment fallback |
| Rahul Verma | NEET dropper | booking_sent | confirmed booking, unpaid |
| Anjali Deshmukh | 10th board | warm | asked about timings |
| Sameer Kulkarni | — | warm | installment objection |
| Vikram Rane | — | warm | wants a demo class |
| Neha Patil | — | cold | one-liner, low intent |
| Aditya Joshi | — | cold | one-liner, low intent |
| Sneha Iyer | JEE | cold | **ghost revival active, step 2 of 3** — 21 days quiet |

All messages are natural Hinglish, the way parents in Pune actually write. Every row is tagged
`metadata.demo = true` so the reset script removes them precisely and can never touch a real
client's data.
