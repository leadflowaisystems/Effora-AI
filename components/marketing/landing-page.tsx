"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, ArrowRight, MessageSquare, Calendar, CreditCard,
  ChevronDown, Check,
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
    a: "None at all. Setup takes under 5 minutes: connect your Instagram or WhatsApp, add your booking link, describe your offer in plain English. We handle the rest.",
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
          <Link href="#demo" className="hover:text-[var(--text)] transition-colors">Demo</Link>
          <Link href="/pricing" className="hover:text-[var(--text)] transition-colors">Pricing</Link>
          <Link href="#faq" className="hover:text-[var(--text)] transition-colors">FAQ</Link>
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
      <section className="relative overflow-hidden px-6 pt-14 pb-10 text-center">
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
          {/* Eyebrow */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1 text-xs text-[var(--text-3)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
            Revenue OS for online service businesses
          </div>

          {/* Recognition headline */}
          <h1 className="font-display font-bold leading-[1.15] tracking-tight text-[var(--text)]">
            <span className="block text-xl sm:text-2xl text-[var(--text-3)] font-medium mb-2">
              Your DMs at 11pm:
            </span>
            <span className="block text-4xl sm:text-5xl lg:text-6xl mb-2">
              47 unread. Half asking &ldquo;price?&rdquo;.
            </span>
            <span className="block text-3xl sm:text-4xl lg:text-5xl text-[var(--brand)]">
              Three already gone to your competitor.
            </span>
          </h1>

          {/* Relief subhead */}
          <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg text-[var(--text-3)] leading-relaxed">
            Effora AI reads every DM the moment it lands. Drafts a reply in your voice. You tap send.{" "}
            <span className="text-[var(--text-2)]">15 minutes a day &mdash; DM chaos is over.</span>
          </p>

          {/* Single CTA */}
          <div className="mt-8 flex justify-center">
            <Link
              href="/onboarding"
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-7 py-3.5 font-semibold text-[#0A0A0C] text-sm hover:opacity-90 transition-opacity shadow-[var(--shadow-jade)]"
            >
              Start free &mdash; 14-day trial, no card, 4-minute setup
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          </div>

          {/* Live channel strip */}
          <div className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-2 max-w-lg">
            {["Instagram DMs", "WhatsApp", "Booking automation", "Payment recovery"].map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
                {label}
                <span className="opacity-70">&middot; Live</span>
              </span>
            ))}
          </div>

          {/* Proof stat */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-10 inline-block"
          >
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] px-8 py-5 shadow-[var(--shadow-jade)]">
              <p className="font-mono text-4xl font-bold text-[var(--brand)]">&#8377;4.6L</p>
              <p className="mt-1 text-xs text-[var(--text-3)]">recovered for early users in 30 days</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-3)] opacity-60">based on early beta cohort (Q1 2026)</p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── INTERACTIVE DEMO — moved above fold, directly under CTA ── */}
      <section id="demo" className="px-6 pb-16 scroll-mt-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 text-center">
            <p className="text-sm text-[var(--text-3)]">
              See it work. No signup. Pick a scenario:
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
                title: "Process DMs 10x faster",
                desc: "Screenshot your Instagram or WhatsApp inbox, upload it. AI scores every lead 0-100 and drafts a reply in your voice — with your booking link pre-embedded for hot leads.",
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
                desc: "See which post, reel, or story each lead came from. Track DM to booked to showed to paid with source attribution. Know what content makes money.",
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
              {
                label: "ManyChat (free plan)",
                items: [
                  "Keyword + story triggers only",
                  "Sends pre-written scripts",
                  "No lead scoring or CRM",
                  "No booking or payment automation",
                  "No funnel attribution",
                  "Requires Meta Business approval for some features",
                ],
                bad: true,
              },
              {
                label: "Effora AI",
                items: [
                  "Screenshot any DMs from any app",
                  "AI drafts replies in your voice, per lead",
                  "Lead scoring 0-100 with stage tracking",
                  "Booking + payment automation built-in",
                  "Source attribution: which post made money",
                  "Works standalone — no other tools required",
                ],
                bad: false,
              },
            ].map((col) => (
              <div
                key={col.label}
                className={`rounded-[var(--radius-lg)] border p-5 space-y-3 ${
                  col.bad
                    ? "border-[var(--border)] bg-[var(--bg-2)]"
                    : "border-[var(--brand)]/40 bg-[var(--brand)]/5"
                }`}
              >
                <p
                  className={`font-semibold text-sm ${
                    col.bad ? "text-[var(--text-3)]" : "text-[var(--brand)]"
                  }`}
                >
                  {col.label}
                </p>
                <ul className="space-y-2">
                  {col.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                      <span
                        className={`mt-0.5 shrink-0 ${
                          col.bad ? "text-[var(--text-3)]" : "text-[var(--brand)]"
                        }`}
                      >
                        {col.bad ? "·" : "✓"}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-[var(--text-3)]">
            Effora AI works standalone. Already using ManyChat for comment triggers? Keep it — Effora handles everything once the DM lands.
          </p>
        </div>
      </section>

      {/* ── PRIVATE BETA — replaces fake testimonials ── */}
      <section className="px-6 py-16 border-t border-[var(--border)] bg-[var(--bg-1)]">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-3 py-1 text-xs font-medium text-[var(--brand)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
            Private beta
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text)] mb-4">
            Building with our first customers.
          </h2>
          <p className="text-[var(--text-3)] leading-relaxed max-w-xl mx-auto">
            Effora is currently in private beta with service businesses across multiple categories —
            coaches, consultants, therapists, tutors, and agencies. Want early access?
            Start your 14-day trial — we work with you directly to set up your DM automation and CRM.
            Real founder support, no copy-paste support tickets.
          </p>
          <Link
            href="/onboarding"
            className="mt-8 inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-6 py-3 font-semibold text-[#0A0A0C] text-sm hover:opacity-90 transition-opacity"
          >
            Get early access
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="px-6 py-16 border-t border-[var(--border)]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <h2 className="font-display text-3xl font-bold text-[var(--text)]">Pricing</h2>
            <p className="mt-2 text-[var(--text-3)]">14-day free trial on all plans. No card required.</p>
          </div>
          <PricingCards />
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
            Get the founder&apos;s weekly note on what&apos;s working for service businesses.
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
                {waitlistStatus === "loading" ? "..." : "Subscribe"}
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
            <Link href="/login" className="hover:text-[var(--text)] transition-colors">Sign in</Link>
            <a href="mailto:leadflowai.systems@gmail.com" className="hover:text-[var(--text)] transition-colors">Contact</a>
          </div>
          <p className="text-xs text-[var(--text-3)]">
            &copy; Effora AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
