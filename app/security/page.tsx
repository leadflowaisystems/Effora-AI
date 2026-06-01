/**
 * /security — public security overview page for prospects and coaches.
 */

import { Metadata } from "next";
import Link from "next/link";
import { Shield, Lock, Database, Zap, Eye, Server, GitBranch } from "lucide-react";

export const metadata: Metadata = {
  title: "Security — Effora AI",
  description: "Effora AI security overview: data encryption, access control, compliance, and vulnerability management.",
};

const sections = [
  {
    icon: Lock,
    title: "Data encryption",
    points: [
      "All data in transit protected by TLS 1.3 with HSTS preloading",
      "Integration credentials (Razorpay, Cal.com, ManyChat) encrypted at rest using AES-256-GCM before storage",
      "Supabase database encryption at rest (AES-256)",
      "Environment secrets stored in Vercel's encrypted secret store, never in source code",
    ],
  },
  {
    icon: Shield,
    title: "Access control",
    points: [
      "Row-Level Security (RLS) on every Supabase table — zero cross-org data exposure enforced at the database layer",
      "Service-role credentials never sent to the browser — all privileged operations run server-side only",
      "Multi-tier auth: Supabase Auth + Google OAuth 2.0 with PKCE",
      "Per-org membership roles: owner, admin, member with explicit permission checks on every API route",
    ],
  },
  {
    icon: Database,
    title: "Infrastructure",
    points: [
      "Hosted on Vercel (SOC 2 Type II) + Supabase (SOC 2 Type II, ISO 27001)",
      "No personal data leaves India/EU regions (Supabase region selected at project creation)",
      "Connection pooling via PgBouncer — no persistent long-lived DB connections from serverless functions",
      "Automated weekly dependency updates via GitHub Dependabot",
    ],
  },
  {
    icon: Eye,
    title: "Monitoring & incident response",
    points: [
      "Server-side error log (error_log table) captures all unhandled exceptions with route + org context",
      "Audit log records all sensitive actions: login, subscription changes, credential updates, plan upgrades/downgrades",
      "Admin dashboard at /admin/health shows live quota usage and error counts",
      "Security issues: email security@Effora AI.app (or open a GitHub security advisory for responsible disclosure)",
    ],
  },
  {
    icon: GitBranch,
    title: "Application security",
    points: [
      "Content Security Policy on all routes: restricts script, frame, and connection sources",
      "Webhook signatures verified via HMAC-SHA256 for all incoming webhooks (Cal.com, Razorpay)",
      "Rate limiting on all public endpoints (Upstash Redis sliding window in production)",
      "Prompt injection mitigations: user input wrapped in delimiters and sanitized before LLM calls",
      "Input validation with Zod on all form-facing API routes",
    ],
  },
  {
    icon: Server,
    title: "AI data handling",
    points: [
      "Lead message content sent to Groq (US-hosted) only for qualification and draft generation",
      "No lead personal data stored by Groq — Groq's API is stateless with no training on API traffic",
      "AI message quotas enforced per plan tier — no runaway spend possible",
      "Coach can delete all org data via account deletion (cascades to all tables via FK ON DELETE CASCADE)",
    ],
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-1)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--brand)]" />
            <span className="font-display font-bold text-sm">Effora AI</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-[var(--text-3)]">
            <Link href="/" className="hover:text-[var(--text)] transition-colors">Home</Link>
            <Link href="/pricing" className="hover:text-[var(--text)] transition-colors">Pricing</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-6 pt-16 pb-12 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand)]/10 border border-[var(--brand)]/20">
          <Shield className="h-8 w-8 text-[var(--brand)]" />
        </div>
        <h1 className="font-display text-4xl font-bold text-[var(--text)] mb-4">
          Security at Effora AI
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-[var(--text-2)] leading-relaxed">
          Your leads, conversations, and revenue data are the most sensitive assets in your business.
          Here&apos;s exactly how we protect them.
        </p>
      </div>

      {/* Sections */}
      <div className="mx-auto max-w-5xl px-6 pb-24 space-y-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {sections.map(({ icon: Icon, title, points }) => (
            <div
              key={title}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-1)] p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand)]/10 border border-[var(--brand)]/20">
                  <Icon className="h-4.5 w-4.5 text-[var(--brand)]" />
                </div>
                <h2 className="font-display text-base font-semibold text-[var(--text)]">
                  {title}
                </h2>
              </div>
              <ul className="space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-[var(--text-2)] leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-2)] p-6 text-center space-y-3">
          <h2 className="font-display text-lg font-semibold text-[var(--text)]">
            Found a vulnerability?
          </h2>
          <p className="text-sm text-[var(--text-2)] max-w-lg mx-auto">
            Please disclose responsibly. Email{" "}
            <a href="mailto:security@Effora AI.app" className="text-[var(--brand)] underline underline-offset-2">
              security@Effora AI.app
            </a>{" "}
            with details. We aim to respond within 48 hours and will credit researchers
            in our changelog.
          </p>
        </div>
      </div>
    </div>
  );
}
