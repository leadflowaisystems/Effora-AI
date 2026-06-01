"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, ArrowRight, MessageSquare, Calendar, CreditCard,
  ChevronDown, Star, Check,
} from "lucide-react";
import { PricingCards } from "./pricing-cards";
import { InteractiveDemo } from "./interactive-demo";
import { cn } from "@/lib/utils";

/* ── Helpers ── */
function GrainOverlay() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 opacity-[0.025]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat",
        backgroundSize: "128px",
      }}
    />
  );
}

/* ── FAQ items ── */
const FAQ_ITEMS = [
  {
    q: "What does Effora AI cost?",
    a: "Plans start at ₹2,999/month after a free 14-day trial. No card required to start. Cancel anytime.",
  },
  {
    q: "Is it safe to connect my Instagram?",
    a: "Yes. Effora AI uses Instagram's official Graph API — no password sharing, no third-party scraping. Your account stays fully under your control.",
  },
  {
    q: "Can I get a refund if it doesn't work for me?",
    a: "Yes — if you don't see value within the first 30 days of a paid plan, email us and we'll refund you, no questions asked.",
  },
  {
    q: "What if my DMs are messy or low volume?",
    a: "Effora AI works best with 10+ DMs/week but handles any volume gracefully. The AI only responds when it has enough context to be genuinely helpful.",
  },
  {
    q: "Do I need any technical knowledge?",
    a: "None at all. Setup takes under 5 minutes: connect your Instagram, add your Cal.com link, describe your offer in plain English. We handle the rest.",
  },
  {
    q: "Can I cancel whenever I want?",
    a: "Yes — cancellation is instant from your billing settings. You keep access until the end of your paid period.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-b border-[var(--border)] last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="font-medium text-[var(--text)]">{q}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--text-3)] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm text-[var(--text-3)] leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const TESTIMONIALS = [
  {
    name: "Riya Malhotra",
    handle: "@riyafitnesscoach",
    text: "I used to spend 3 hours/day replying to DMs. Now Effora AI handles 90% of them and sends my Cal link automatically. I've booked 6 extra calls this week alone.",
    label: "BETA — early customer",
  },
  {
    name: "Arjun Singh",
    handle: "@arjunstrength",
    text: "The dunning sequence recovered ₹45,000 in payments I thought were just lost. I didn't have to send a single awkward 'please pay' message myself.",
    label: "BETA — early customer",
  },
  {
    name: "Kavya Nair",
    handle: "@kavyanutrition",
    text: "Setup took literally 4 minutes. The AI replies sound exactly like me — not like a bot. My followers don't even know it's automated.",
    label: "BETA — early customer",
  },
];

/* ── Main Component ── */
export function LandingPage() {
  const [waitlistEmail, setWaitlistEmail] = React.useState("");
  const [waitlistStatus, setWaitlistStatus] = React.useState<"idle" | "loading" | "done">("idle");

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!waitlistEmail) return;
    setWaitlistStatus("loading");
    await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: waitlistEmail }),
    });
    setWaitlistStatus("done");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <GrainOverlay />

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/90 px-6 py-3 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[var(--brand)]" />
          <span className="font-display font-bold text-sm tracking-tight">Effora AI</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-sm text-[var(--text-3)]">
          <Link href="#demo"    className="hover:text-[var(--text)] transition-colors">Demo</Link>
          <Link href="/pricing" className="hover:text-[var(--text)] transition-colors">Pricing</Link>
          <Link href="#faq"     className="hover:text-[var(--text)] transition-colors">FAQ</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[var(--text-3)] hover:text-[var(--text)] transition-colors">
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-1.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 transition-opacity"
          >
            Start free
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
        {/* Radial jade glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full opacity-20"
          style={{ background: "radial-gradient(ellipse at center, var(--brand) 0%, transparent 70%)" }}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative mx-auto max-w-3xl"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1 text-xs text-[var(--text-3)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
            Revenue OS for Instagram coaches
          </div>

          <h1 className="font-display text-5xl font-bold leading-[1.1] tracking-tight text-[var(--text)] sm:text-6xl lg:text-7xl">
            Close 40% more leads
            <br />
            <span className="text-[var(--brand)]">in 15 minutes a day.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--text-3)] leading-relaxed">
            The AI cockpit for coaches. Paste DMs or screenshot your inbox, get smart replies in your voice.
            Cal.com, Razorpay, dunning, revival — all on autopilot.{" "}
            <span className="text-[var(--text-2)]">No bots, no paid tools, no Meta approval needed.</span>
          </p>

          {/* Channel availability strip */}
          <div className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-2 max-w-lg">
            {[
              { label: "ManyChat",              status: "live"    },
              { label: "Instagram via ManyChat", status: "live"    },
              { label: "Native Instagram",       status: "q3-2026" },
              { label: "WhatsApp",               status: "roadmap" },
            ].map((ch) => (
              <span
                key={ch.label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  ch.status === "live"
                    ? "border-[var(--brand)]/30 bg-[var(--brand)]/10 text-[var(--brand)]"
                    : ch.status === "q3-2026"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-3)]",
                )}
              >
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  ch.status === "live" ? "bg-[var(--brand)]" :
                  ch.status === "q3-2026" ? "bg-amber-400" : "bg-[var(--text-3)]",
                )} />
                {ch.label}
                {ch.status === "live"    && <span className="opacity-70">· Live</span>}
                {ch.status === "q3-2026" && <span className="opacity-70">· Q3 2026</span>}
                {ch.status === "roadmap" && <span className="opacity-70">· Roadmap</span>}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/onboarding"
              className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-6 py-3 font-semibold text-[#0A0A0C] text-sm hover:opacity-90 transition-opacity shadow-[var(--shadow-jade)]"
            >
              Start 14-day Growth trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#demo"
              className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-1)] px-6 py-3 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
            >
              See interactive demo ↓
            </a>
          </div>

          {/* Big mono revenue number */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-12 inline-block"
          >
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] px-8 py-5 shadow-[var(--shadow-jade)]">
              <p className="font-mono text-4xl font-bold text-[var(--brand)]">₹4.6L</p>
              <p className="mt-1 text-xs text-[var(--text-3)]">recovered for early users in 30 days</p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── INTERACTIVE DEMO ── */}
      <section id="demo" className="px-6 py-16 scroll-mt-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <h2 className="font-display text-3xl font-bold text-[var(--text)]">
              See it in action
            </h2>
            <p className="mt-2 text-[var(--text-3)]">
              No signup needed. Pick a scenario and watch the AI respond.
            </p>
          </div>
          <InteractiveDemo />
        </div>
      </section>

      {/* ── THREE PILLARS ── */}
      <section className="px-6 py-16 border-t border-[var(--border)]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-bold text-[var(--text)]">
              Three hours of DM work. Done in 15 minutes.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                icon: MessageSquare,
                title: "Process DMs 10× faster",
                desc: "Screenshot your Instagram DM list, upload it. AI scores every lead 0-100 and drafts a reply in your voice — with your Cal.com link pre-embedded for hot leads.",
                color: "text-[var(--brand)]",
              },
              {
                icon: Calendar,
                title: "Auto-pilot back office",
                desc: "Booking reminders, no-show recovery, payment dunning, ghost revival — every follow-up runs automatically. You close deals; Effora AI does the chasing.",
                color: "text-blue-400",
              },
              {
                icon: CreditCard,
                title: "Full funnel attribution",
                desc: "See which IG post, reel, or story each lead came from. Track DM → booked → showed → paid with source attribution. Know what content makes money.",
                color: "text-purple-400",
              },
            ].map((p) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-6"
              >
                <p.icon className={cn("h-8 w-8 mb-4", p.color)} />
                <h3 className="font-display text-lg font-semibold text-[var(--text)] mb-2">{p.title}</h3>
                <p className="text-sm text-[var(--text-3)] leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="px-6 py-16 border-t border-[var(--border)] bg-[var(--bg-1)]">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl font-bold text-[var(--text)] mb-8 text-center">
            Early coaches love it
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.handle}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-5"
              >
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-[var(--brand)] text-[var(--brand)]" />
                  ))}
                </div>
                <p className="text-sm text-[var(--text-2)] leading-relaxed mb-4">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{t.name}</p>
                    <p className="text-xs text-[var(--text-3)]">{t.handle}</p>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-3)]">
                    {t.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ── */}
      <section className="px-6 py-16 border-t border-[var(--border)]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <h2 className="font-display text-3xl font-bold text-[var(--text)]">Pricing</h2>
            <p className="mt-2 text-[var(--text-3)]">14-day free trial on all plans. No card required.</p>
          </div>
          <PricingCards />
        </div>
      </section>

      {/* ── WHY NOT MANYCHAT ── */}
      <section className="px-6 py-16 border-t border-[var(--border)]">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-bold text-[var(--text)]">
              &ldquo;Why not just use ManyChat?&rdquo;
            </h2>
            <p className="mt-2 text-[var(--text-3)]">Fair question. Here&apos;s the honest comparison.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { label: "ManyChat (free plan)", items: ["Keyword + story triggers only", "Sends pre-written scripts", "No lead scoring or CRM", "No booking or payment automation", "No funnel attribution", "Requires Meta Business approval for some features"], bad: true },
              { label: "Effora AI Cockpit", items: ["Screenshot any DMs from any app", "AI drafts replies in your voice, per lead", "Lead scoring 0-100 with stage tracking", "Cal.com + Razorpay automation built-in", "Source attribution: which post made money", "No Meta approval, no API setup required"], bad: false },
            ].map((col) => (
              <div key={col.label} className={`rounded-[var(--radius-lg)] border p-5 space-y-3 ${col.bad ? "border-[var(--border)] bg-[var(--bg-2)]" : "border-[var(--brand)]/40 bg-[var(--brand)]/5"}`}>
                <p className={`font-semibold text-sm ${col.bad ? "text-[var(--text-3)]" : "text-[var(--brand)]"}`}>{col.label}</p>
                <ul className="space-y-2">
                  {col.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                      <span className={`mt-0.5 shrink-0 ${col.bad ? "text-[var(--text-3)]" : "text-[var(--brand)]"}`}>{col.bad ? "·" : "✓"}</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-[var(--text-3)]">
            Effora AI works alongside ManyChat — use ManyChat for free story/comment triggers, Effora AI for everything after the DM.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="px-6 py-16 border-t border-[var(--border)] scroll-mt-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-3xl font-bold text-[var(--text)] mb-8 text-center">FAQ</h2>
          <div>
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── WAITLIST ── */}
      <section className="px-6 py-16 border-t border-[var(--border)] bg-[var(--bg-1)]">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-display text-2xl font-bold text-[var(--text)]">
            Not ready yet?
          </h2>
          <p className="mt-2 text-sm text-[var(--text-3)]">
            Get the founder&apos;s weekly note on what&apos;s working for coaches.
          </p>
          {waitlistStatus === "done" ? (
            <div className="mt-6 flex items-center justify-center gap-2 text-[var(--brand)]">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">You&apos;re in! Check your inbox.</span>
            </div>
          ) : (
            <form onSubmit={handleWaitlist} className="mt-6 flex gap-2">
              <input
                type="email"
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none focus:border-[var(--brand)] transition-colors"
              />
              <button
                type="submit"
                disabled={waitlistStatus === "loading"}
                className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {waitlistStatus === "loading" ? "…" : "Subscribe"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="px-6 py-20 text-center border-t border-[var(--border)]">
        <div className="mx-auto max-w-xl">
          <h2 className="font-display text-3xl font-bold text-[var(--text)]">
            Start earning while you sleep.
          </h2>
          <p className="mt-3 text-[var(--text-3)]">
            14-day free trial. Setup in 5 minutes. Cancel anytime.
          </p>
          <Link
            href="/onboarding"
            className="mt-8 inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-8 py-3.5 font-semibold text-[#0A0A0C] hover:opacity-90 transition-opacity shadow-[var(--shadow-jade)]"
          >
            Get started — it&apos;s free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-[var(--border)] px-6 py-8">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--brand)]" />
            <span className="font-display font-bold text-sm text-[var(--text)]">Effora AI</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-[var(--text-3)]">
            <Link href="/pricing" className="hover:text-[var(--text)] transition-colors">Pricing</Link>
            <Link href="/login"   className="hover:text-[var(--text)] transition-colors">Sign in</Link>
            <a href="mailto:om@leadflowai.in" className="hover:text-[var(--text)] transition-colors">Contact</a>
          </div>
          <p className="text-xs text-[var(--text-3)]">
            Built solo by Om Narkar from Pune, India. ✦
          </p>
        </div>
      </footer>
    </div>
  );
}
