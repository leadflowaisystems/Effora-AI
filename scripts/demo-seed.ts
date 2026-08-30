/**
 * scripts/demo-seed.ts
 *
 * Creates (or refreshes) the permanent demo org used for prospect demos:
 *   "Ascent Academy, Pune" — slug: ascent-academy-demo
 *
 * Seeds 8 realistic coaching-institute enquiries in natural Hinglish across
 * JEE / NEET / board streams, one confirmed booking, one captured payment, and
 * one ghost-revival sequence mid-flight.
 *
 * Usage:
 *   npx tsx scripts/demo-seed.ts
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ENCRYPTION_KEY                    (to store the Razorpay webhook secret)
 * Optional:
 *   DEMO_OWNER_EMAIL                  (defaults to omnaarkar7@gmail.com)
 *   DEMO_RAZORPAY_KEY_ID              (rzp_test_...)
 *   DEMO_RAZORPAY_KEY_SECRET
 *   DEMO_RAZORPAY_WEBHOOK_SECRET      (from Razorpay Dashboard → Settings → Webhooks)
 *
 * Everything it writes is tagged metadata.demo = true so demo-reset.ts can
 * remove it precisely without touching real client data.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { encryptSecret } from "../lib/crypto";

export const DEMO_SLUG  = "ascent-academy-demo";
export const DEMO_NAME  = "Ascent Academy, Pune";
const DEMO_OWNER_EMAIL  = process.env.DEMO_OWNER_EMAIL ?? "omnaarkar7@gmail.com";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const svc: any = createClient(url, key, { auth: { persistSession: false } });

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

// ── The 8 enquiries ─────────────────────────────────────────────────────────
// Written the way parents in Pune actually message a coaching institute.
interface DemoLead {
  name:      string;
  phone:     string;
  stage:     string;
  score:     number;
  daysAgo:   number;
  inbound:   string;
  reply?:    string;          // outbound AI reply, if any
  followUp?: string;          // second inbound
  booking?:  boolean;
  payment?:  boolean;
  revival?:  boolean;
}

export const DEMO_LEADS: DemoLead[] = [
  {
    name: "Priya Sharma", phone: "919822011001", stage: "won", score: 92, daysAgo: 6,
    inbound: "Namaste sir, meri beti 11th me ja rahi hai. JEE ke liye 2 year integrated batch ka fees kya hai?",
    reply: "Namaste Priya ji! 2-year JEE integrated batch ₹1,20,000 ka hai — installments me bhi de sakte hain. Batch size 30 students, daily 3 hours. Aap ek demo class ke liye aa sakti hain? Yeh raha slot book karne ka link:",
    followUp: "Haan sir, Saturday morning theek rahega.",
    booking: true, payment: true,
  },
  {
    name: "Rahul Verma", phone: "919822011002", stage: "booking_sent", score: 88, daysAgo: 3,
    inbound: "Sir NEET dropper batch available hai? Ek batch me kitne students hote hain?",
    reply: "Hi Rahul! Haan, NEET dropper batch chal raha hai — 25 students per batch, taaki personal attention mile. Full syllabus + 40 test series included. Counselling call book kar lijiye, main aapko detail me bata deta hoon:",
    booking: true,
  },
  {
    name: "Anjali Deshmukh", phone: "919822011003", stage: "warm", score: 61, daysAgo: 2,
    inbound: "10th board ke liye maths aur science ka tuition hai kya? Timings kya hain?",
    reply: "Hello Anjali ji! Haan, 10th ke liye Maths + Science batch hai — Mon/Wed/Fri, shaam 5 se 7. SSC aur CBSE dono ke liye alag batches hain. Kaunsa board hai aapka?",
  },
  {
    name: "Sameer Kulkarni", phone: "919822011004", stage: "warm", score: 58, daysAgo: 2,
    inbound: "Fees ek saath dena mushkil hai. Installment me ho sakta hai kya?",
    reply: "Bilkul Sameer ji — 3 installments me kar sakte hain, koi extra charge nahi. Admission ke time 40%, baaki do 3-3 months me. Kis batch ke liye soch rahe hain?",
  },
  {
    name: "Vikram Rane", phone: "919822011005", stage: "warm", score: 55, daysAgo: 1,
    inbound: "Demo class attend kar sakte hain kya pehle?",
    reply: "Haan Vikram ji, demo class free hai! Har Saturday 10 AM ko hoti hai. Aap apna stream bata dijiye — JEE, NEET ya board?",
  },
  {
    name: "Neha Patil", phone: "919822011006", stage: "cold", score: 24, daysAgo: 1,
    inbound: "Timing kya hai?",
  },
  {
    name: "Aditya Joshi", phone: "919822011007", stage: "cold", score: 19, daysAgo: 1,
    inbound: "Location kaha hai aapka?",
  },
  {
    name: "Sneha Iyer", phone: "919822011008", stage: "cold", score: 47, daysAgo: 21,
    inbound: "JEE batch ke baare me jaanna tha, details bhej dijiye",
    reply: "Hi Sneha ji! JEE ke liye 1-year aur 2-year dono batches hain. Fees ₹85,000 se start hoti hai. Aap kis class me hain abhi?",
    revival: true,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function findOwnerUserId(): Promise<string | null> {
  try {
    const { data, error } = await svc.auth.admin.listUsers({ perPage: 200 });
    if (error) { console.warn("  ! could not list auth users:", error.message); return null; }
    const match = (data?.users ?? []).find(
      (u: { email?: string }) => (u.email ?? "").toLowerCase() === DEMO_OWNER_EMAIL.toLowerCase(),
    );
    return match?.id ?? null;
  } catch (e) {
    console.warn("  ! auth.admin.listUsers failed:", e);
    return null;
  }
}

/** Remove every demo-tagged row, leaving the org shell intact. */
export async function wipeDemoData(orgId: string): Promise<void> {
  // Children first — FKs cascade from conversations/leads, but be explicit so
  // the script is readable and order-independent.
  const { data: leads } = await svc.from("leads").select("id").eq("org_id", orgId);
  const leadIds: string[] = (leads ?? []).map((l: { id: string }) => l.id);

  await svc.from("sequence_runs").delete().eq("org_id", orgId);
  await svc.from("payments").delete().eq("org_id", orgId);
  await svc.from("bookings").delete().eq("org_id", orgId);
  await svc.from("ai_drafts").delete().eq("org_id", orgId);
  await svc.from("messages").delete().eq("org_id", orgId);
  await svc.from("conversations").delete().eq("org_id", orgId);
  if (leadIds.length) await svc.from("leads").delete().in("id", leadIds);
  await svc.from("metrics_daily").delete().eq("org_id", orgId);

  console.log(`  ✓ cleared ${leadIds.length} leads and all related demo rows`);
}

/** Create the demo org if absent; return its id. */
export async function ensureDemoOrg(): Promise<string> {
  const { data: existing } = await svc.from("orgs").select("id").eq("slug", DEMO_SLUG).maybeSingle();
  if (existing) {
    await svc.from("orgs").update({
      name: DEMO_NAME, active_channel: "whatsapp_cloud", auto_send_replies: false,
    }).eq("id", existing.id);
    console.log(`  ✓ demo org exists (${existing.id})`);
    return existing.id;
  }

  const { data: created, error } = await svc.from("orgs").insert({
    slug: DEMO_SLUG, name: DEMO_NAME, plan: "pro",
    active_channel: "whatsapp_cloud", auto_send_replies: false,
  }).select("id").single();

  if (error || !created) throw new Error(`could not create demo org: ${error?.message}`);
  console.log(`  ✓ demo org created (${created.id})`);
  return created.id;
}

async function ensureMembership(orgId: string) {
  const userId = await findOwnerUserId();
  if (!userId) {
    console.warn(`  ! no auth user found for ${DEMO_OWNER_EMAIL} — you will not see the demo org in the app.`);
    console.warn("    Sign up/log in with that email once, then re-run this script.");
    return;
  }
  await svc.from("org_members").upsert(
    { org_id: orgId, user_id: userId, role: "owner" },
    { onConflict: "org_id,user_id" },
  );
  console.log(`  ✓ ${DEMO_OWNER_EMAIL} is owner of the demo org`);
}

async function ensureVoiceProfile(orgId: string) {
  await svc.from("voice_profiles").upsert({
    org_id:        orgId,
    tone:          "Warm, respectful, and direct. Uses simple Hinglish the way a Pune institute owner actually speaks to parents. Addresses people as 'ji'. Never pushy.",
    offer:         "JEE, NEET and board-exam coaching for classes 9–12, plus a NEET dropper batch. Small batches (25–30 students), daily doubt-clearing, and a full test series.",
    price_range:   "₹85,000 to ₹1,20,000 per year depending on stream and duration. 3 interest-free installments available.",
    sells:         "Personal attention through small batch sizes, faculty from IIT/AIIMS backgrounds, and a free demo class before admission.",
    objections:    ["Fees too high", "Too far from home", "Already enrolled elsewhere", "Want to see results first"],
    extra_context: "Located in Kothrud, Pune. Demo classes run every Saturday at 10 AM. Admissions peak in March–June.",
  }, { onConflict: "org_id" });
  console.log("  ✓ voice profile set (coaching-institute tone)");
}

/**
 * Store the demo org's Razorpay TEST-mode credentials, including the webhook
 * secret. Without the webhook secret the payment step of the demo silently
 * fails: app/api/webhooks/razorpay/[orgId]/route.ts is fail-closed as of the
 * Phase 1 security work and returns 401 when no secret is stored.
 */
async function ensureRazorpay(orgId: string) {
  const keyId         = process.env.DEMO_RAZORPAY_KEY_ID;
  const keySecret     = process.env.DEMO_RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.DEMO_RAZORPAY_WEBHOOK_SECRET;

  if (!keyId || !keySecret || !webhookSecret) {
    console.warn("  ! Razorpay NOT configured — the payment step of the demo will not work.");
    console.warn("    Set DEMO_RAZORPAY_KEY_ID, DEMO_RAZORPAY_KEY_SECRET and");
    console.warn("    DEMO_RAZORPAY_WEBHOOK_SECRET in .env.local, then re-run.");
    console.warn("    See DEMO_SCRIPT.md → 'Razorpay test-mode setup' for where to find them.");
    return;
  }

  let encKeySecret: string;
  let encWebhookSecret: string;
  try {
    encKeySecret     = encryptSecret(keySecret);
    encWebhookSecret = encryptSecret(webhookSecret);
  } catch (e) {
    console.error("  ✗ could not encrypt Razorpay secrets — is ENCRYPTION_KEY set (64 hex chars)?", e);
    return;
  }

  const { data: existing } = await svc.from("integrations")
    .select("id, config").eq("org_id", orgId).eq("provider", "razorpay").maybeSingle();

  const config = {
    ...(existing?.config ?? {}),
    key_id:             keyId,
    key_secret_enc:     encKeySecret,
    webhook_secret_enc: encWebhookSecret,
  };

  if (existing) {
    await svc.from("integrations").update({ config, active: true, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await svc.from("integrations").insert({ org_id: orgId, provider: "razorpay", config, active: true });
  }
  console.log("  ✓ Razorpay test-mode keys + webhook secret stored (encrypted)");
}

// ── Seed ────────────────────────────────────────────────────────────────────

export async function seedDemoData(orgId: string): Promise<void> {
  let bookings = 0, payments = 0, revivals = 0;

  for (const spec of DEMO_LEADS) {
    const created = spec.daysAgo * DAY;

    const { data: lead } = await svc.from("leads").insert({
      org_id:       orgId,
      name:         spec.name,
      channel:      "whatsapp_cloud",
      external_id:  `wa_${spec.phone}`,
      score:        spec.score,
      stage:        spec.stage,
      source:       "whatsapp",
      last_seen_at: iso(created - HOUR),
      created_at:   iso(created),
      updated_at:   iso(created - HOUR),
      metadata:     { demo: true, phone: spec.phone },
    }).select("id").single();
    if (!lead) { console.warn(`  ! failed to insert lead ${spec.name}`); continue; }

    const { data: conv } = await svc.from("conversations").insert({
      org_id:               orgId,
      lead_id:              lead.id,
      channel_provider:     "whatsapp_cloud",
      last_message_at:      iso(created - HOUR),
      last_message_preview: (spec.followUp ?? spec.reply ?? spec.inbound).slice(0, 80),
      auto_reply_enabled:   true,
      created_at:           iso(created),
    }).select("id").single();
    if (!conv) { console.warn(`  ! failed to insert conversation for ${spec.name}`); continue; }

    const msgs: Record<string, unknown>[] = [{
      conversation_id: conv.id, org_id: orgId, direction: "inbound",
      content: spec.inbound, sent_at: iso(created),
      metadata: { demo: true, source: "whatsapp", sender_phone: spec.phone },
    }];
    if (spec.reply) {
      msgs.push({
        conversation_id: conv.id, org_id: orgId, direction: "outbound",
        content: spec.reply, sent_at: iso(created - 12 * MIN),
        metadata: { demo: true, source: "ai" },
      });
    }
    if (spec.followUp) {
      msgs.push({
        conversation_id: conv.id, org_id: orgId, direction: "inbound",
        content: spec.followUp, sent_at: iso(created - HOUR),
        metadata: { demo: true, source: "whatsapp", sender_phone: spec.phone },
      });
    }
    await svc.from("messages").insert(msgs);

    if (spec.booking) {
      const startsAt = iso(-2 * DAY); // 2 days in the future
      await svc.from("bookings").insert({
        org_id: orgId, lead_id: lead.id, conversation_id: conv.id,
        status: "confirmed",
        starts_at: startsAt,
        ends_at: new Date(new Date(startsAt).getTime() + HOUR).toISOString(),
        attendee_name: spec.name,
        attendee_email: `${spec.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        cal_booking_uid: `demo_${spec.phone}`,
        recovery_attempt: 0,
        created_at: iso(created - HOUR),
        updated_at: iso(created - HOUR),
      });
      bookings++;
    }

    if (spec.payment) {
      await svc.from("payments").insert({
        org_id: orgId, lead_id: lead.id, conversation_id: conv.id,
        amount_inr: 120000,
        status: "paid",
        payment_link_id: `demo_plink_${spec.phone}`,
        payment_link_url: `https://rzp.io/l/demo_${spec.phone}`,
        created_at: iso(created - 2 * HOUR),
        updated_at: iso(created - HOUR),
      });
      payments++;
    }

    if (spec.revival) {
      await svc.from("sequence_runs").insert({
        org_id: orgId, lead_id: lead.id, conversation_id: conv.id,
        type: "ghost_revival",
        status: "active",
        step_current: 2,
        step_total: 3,
        metadata: { demo: true, inactive_days: 21 },
      });
      revivals++;
    }
  }

  console.log(`  ✓ ${DEMO_LEADS.length} leads, ${bookings} booking(s), ${payments} payment(s), ${revivals} revival(s)`);
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

export async function main(reset = false) {
  console.log(`\n▸ Demo org: ${DEMO_NAME}  (/org/${DEMO_SLUG})\n`);

  const orgId = await ensureDemoOrg();
  await ensureMembership(orgId);
  await ensureVoiceProfile(orgId);
  await ensureRazorpay(orgId);

  if (reset) {
    console.log("  · clearing previous demo data…");
    await wipeDemoData(orgId);
  }

  await seedDemoData(orgId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.effora.co.in";
  console.log(`\n✓ Done. Open ${appUrl}/org/${DEMO_SLUG}/inbox\n`);
}

// Run only when invoked directly, not when imported by demo-reset.ts
if (process.argv[1]?.includes("demo-seed")) {
  main(false).catch((e) => { console.error("\n✗ demo-seed failed:", e); process.exit(1); });
}
