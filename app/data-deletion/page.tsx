import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Deletion — Effora AI",
  description: "How to request deletion of your data from Effora AI.",
};

const CONTACT = "leadflowai.systems@gmail.com";

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-1)]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="font-display text-lg font-bold text-[var(--brand)]">Effora AI</Link>
          <Link href="/" className="text-sm text-[var(--text-3)] hover:text-[var(--text-2)]">← Home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-12 space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Data Deletion Instructions</h1>
          <p className="mt-2 text-sm text-[var(--text-3)]">Required by Meta as part of our app review process.</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">Option 1: Delete from within the app</h2>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-[var(--text-2)]">
            <li>Log in to your Effora AI account.</li>
            <li>Go to <strong>Settings → Account</strong>.</li>
            <li>Scroll to the bottom and click <strong>Delete account</strong>.</li>
            <li>Confirm deletion in the dialog that appears.</li>
          </ol>
          <p className="text-sm text-[var(--text-3)]">This immediately begins the deletion process. All your data will be permanently deleted within 30 days.</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">Option 2: Email request</h2>
          <p className="text-sm text-[var(--text-2)]">Send an email to <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a> with:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text-2)]">
            <li><strong>Subject:</strong> Data deletion request</li>
            <li><strong>Body:</strong> Your registered email address and the reason for deletion (optional)</li>
          </ul>
          <p className="text-sm text-[var(--text-3)]">We will confirm receipt within 48 hours and complete deletion within 30 days.</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">What gets deleted</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text-2)]">
            <li>Your account and profile information</li>
            <li>All leads and their contact information</li>
            <li>All conversation and message history</li>
            <li>All bookings and booking history</li>
            <li>All payment records</li>
            <li>All voice profiles and configuration</li>
            <li>All connected channel tokens (Instagram, WhatsApp) — revoked and deleted</li>
            <li>All AI usage history</li>
          </ul>
          <p className="text-sm text-[var(--text-3)] mt-2">Exception: financial records may be retained for up to 7 years as required by Indian law. These are anonymised where possible.</p>
        </div>

        <p className="text-sm text-[var(--text-3)]">
          Questions? Contact <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a> · <Link href="/privacy" className="text-[var(--brand)] underline">Privacy Policy</Link>
        </p>
      </main>
    </div>
  );
}
