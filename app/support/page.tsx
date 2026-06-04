import { Metadata } from "next";
import Link from "next/link";
import { SupportForm } from "./support-form";

export const metadata: Metadata = {
  title: "Support — Effora AI",
  description: "Get help with Effora AI. Contact us or report a bug.",
};

const CONTACT = "leadflowai.systems@gmail.com";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-1)]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="font-display text-lg font-bold text-[var(--brand)]">Effora AI</Link>
          <Link href="/" className="text-sm text-[var(--text-3)] hover:text-[var(--text-2)]">← Home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-12 space-y-10">
        <div>
          <h1 className="font-display text-3xl font-bold">Support</h1>
          <p className="mt-2 text-[var(--text-3)]">We typically respond within 24 hours on weekdays.</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6 space-y-3">
          <h2 className="font-semibold text-lg">Email support</h2>
          <p className="text-sm text-[var(--text-2)]">
            For any questions, billing issues, or account problems, email us directly:
          </p>
          <a
            href={`mailto:${CONTACT}?subject=Effora%20AI%20Support`}
            className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 transition-opacity"
          >
            {CONTACT}
          </a>
        </div>

        <SupportForm />

        <div className="space-y-2 text-sm text-[var(--text-3)]">
          <p><Link href="/privacy" className="text-[var(--brand)] hover:underline">Privacy Policy</Link> · <Link href="/terms" className="text-[var(--brand)] hover:underline">Terms of Service</Link> · <Link href="/data-deletion" className="text-[var(--brand)] hover:underline">Data Deletion</Link></p>
        </div>
      </main>
    </div>
  );
}
