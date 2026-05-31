# Effora AI

**AI Inbox for Service Businesses on Instagram**

Turn every Instagram DM into booked revenue. AI replies in your voice. Real-time inbox, bookings, payments, CRM, follow-ups — all automated.

Built for coaches, therapists, doctors, tutors, consultants, designers, and any service business that gets clients via Instagram.

---

## What it does

- **Real-time Instagram DM inbox** — sync DMs via Meta Graph API or ManyChat
- **AI that replies in your voice** — qualify leads 0–100, draft replies in your tone
- **Auto-book calls** — Cal.com integration sends booking links to hot leads
- **Collect payments** — Razorpay payment links sent automatically on booking confirmation
- **CRM pipeline** — cold → warm → hot → booked → paid lifecycle tracking
- **Weekly scorecard** — AI-generated coaching insights and accountability tracking
- **ManyChat handoff** — use ManyChat free for keyword triggers, hand off to Effora AI for all follow-up

---

## Tech stack (all free-tier infrastructure)

| Layer | Tool | Cost |
|---|---|---|
| Framework | Next.js 14 (App Router) | Free |
| Database | Supabase (PostgreSQL + Realtime) | Free |
| Auth | Supabase Auth | Free |
| AI | Groq (Llama 3.3 70B) | Free |
| Background jobs | Inngest | Free |
| Email | Brevo SMTP (300/day) | Free |
| Payments | Razorpay | Per transaction |
| Calendar | Cal.com | Free |
| Push notifications | Web Push API (VAPID) | Free |
| Rate limiting | Upstash Redis | Free |
| Hosting | Vercel | Free |

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/leadflowaisystems/Effora-AI.git
cd Effora-AI
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in every variable:

```bash
cp .env.example .env.local
```

Required for core functionality:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `LLM_API_KEY` (Groq key from console.groq.com)
- `ENCRYPTION_KEY` (32-byte hex, generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

### 3. Database

Run migrations in order in Supabase SQL Editor:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_phase1.sql
... (run all in order up to the latest)
```

Enable Realtime on the `messages` table: Supabase Dashboard → Database → Replication → messages → toggle on.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Instagram integration

Follow `docs/META_APP_SETUP.md` to:
1. Create a Meta App at developers.facebook.com
2. Configure webhooks
3. Submit for App Review (1–3 week wait)
4. Set `META_APP_MODE=live` once approved

Until approved, coaches can connect their own Instagram accounts for testing.

---

## Repository

**GitHub:** https://github.com/leadflowaisystems/Effora-AI

---

## License

MIT
