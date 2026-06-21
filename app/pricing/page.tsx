import { PricingCards } from "@/components/marketing/pricing-cards";
import { FeatureMatrix } from "@/components/marketing/feature-matrix";
import Link from "next/link";
import { Zap } from "lucide-react";

export const metadata = { title: "Pricing — Effora AI" };

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[var(--brand)]" />
          <span className="font-display font-bold text-sm">Effora AI</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[var(--text-3)] hover:text-[var(--text)] transition-colors">
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-[#0A0A0C] hover:opacity-90 transition-opacity"
          >
            Start free trial
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="mx-auto max-w-3xl px-6 pt-16 pb-8 text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-lg text-[var(--text-3)]">
          Start free for 15 days. No card required. Upgrade when you&apos;re ready.
        </p>
      </div>

      {/* Pricing cards */}
      <div className="mx-auto max-w-5xl px-6 pb-16">
        <PricingCards />
      </div>

      {/* Feature matrix */}
      <div className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="font-display text-2xl font-bold text-center text-[var(--text)] mb-8">
          Compare all features
        </h2>
        <FeatureMatrix />
      </div>

      {/* FAQ teaser */}
      <div className="border-t border-[var(--border)] py-16 text-center">
        <p className="text-sm text-[var(--text-3)]">
          Questions?{" "}
          <Link href="/#faq" className="text-[var(--brand)] hover:underline">
            See the FAQ
          </Link>{" "}
          or{" "}
          <a href="mailto:leadflowai.systems@gmail.com" className="text-[var(--brand)] hover:underline">
            email us
          </a>
          .
        </p>
      </div>
    </div>
  );
}
