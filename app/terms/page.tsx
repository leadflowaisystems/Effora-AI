import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Effora AI",
  description: "Terms governing your use of the Effora AI platform.",
};

const UPDATED = "1 June 2025";
const CONTACT = "leadflowai.systems@gmail.com";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-1)]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="font-display text-lg font-bold text-[var(--brand)]">Effora AI</Link>
          <Link href="/" className="text-sm text-[var(--text-3)] hover:text-[var(--text-2)]">← Home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12 space-y-10">
        <div>
          <h1 className="font-display text-3xl font-bold">Terms of Service</h1>
          <p className="mt-2 text-sm text-[var(--text-3)]">Last updated: {UPDATED}</p>
        </div>
        <Section title="1. Agreement">
          <p>By registering for or using Effora AI (&ldquo;Service&rdquo;), you agree to these Terms. If you do not agree, do not use the Service. &ldquo;Effora&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; refers to Leadflow AI Systems.</p>
        </Section>
        <Section title="2. Service description">
          <p>Effora provides an AI-assisted inbox, CRM, booking, and payment management platform for coaches and service businesses. The Service integrates with Instagram, WhatsApp, Cal.com, and Razorpay.</p>
        </Section>
        <Section title="3. Account responsibilities">
          <ul className="list-disc pl-5 space-y-1">
            <li>You must be at least 18 years old to use the Service.</li>
            <li>You are responsible for maintaining the confidentiality of your credentials.</li>
            <li>You are responsible for all activity under your account.</li>
            <li>Provide accurate registration information and keep it updated.</li>
            <li>Notify us immediately at <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a> if your account is compromised.</li>
          </ul>
        </Section>
        <Section title="4. Acceptable use">
          <p>You agree NOT to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Send unsolicited messages (spam) to any person via any channel connected to Effora.</li>
            <li>Violate Meta&apos;s Platform Terms, WhatsApp Business Policy, or any other third-party terms of service.</li>
            <li>Message recipients who have not opted in to receive communications from you.</li>
            <li>Collect or process data in violation of applicable privacy laws.</li>
            <li>Use Effora for illegal, fraudulent, or harmful activities.</li>
            <li>Attempt to reverse-engineer, scrape, or abuse the Effora platform or its APIs.</li>
            <li>Share your account with others or resell access without our written consent.</li>
          </ul>
          <p className="mt-2">Violation may result in immediate account suspension without refund.</p>
        </Section>
        <Section title="5. Payment terms">
          <ul className="list-disc pl-5 space-y-1">
            <li>Subscriptions are billed monthly in advance via Razorpay.</li>
            <li>All prices are in Indian Rupees (₹) and inclusive of applicable taxes.</li>
            <li>Failed payments result in a 7-day grace period before account suspension.</li>
            <li><strong>Refund policy:</strong> we offer a 7-day money-back guarantee on first-time subscriptions. After 7 days, no refunds are issued for the current billing period. Contact <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a> for refund requests.</li>
            <li>You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.</li>
            <li>We reserve the right to change pricing with 30 days&apos; notice.</li>
          </ul>
        </Section>
        <Section title="6. Intellectual property">
          <p>Effora owns all rights to the platform, code, and brand. You retain ownership of all data you input (leads, messages, business data). You grant Effora a limited licence to process your data solely to provide the Service.</p>
        </Section>
        <Section title="7. Third-party integrations">
          <p>Effora integrates with Meta (Instagram/WhatsApp), Cal.com, Razorpay, and others. Your use of connected services is governed by their respective terms. Effora is not responsible for third-party service outages or policy changes.</p>
        </Section>
        <Section title="8. Limitation of liability">
          <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, EFFORA SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE.</p>
          <p className="mt-2">OUR TOTAL CUMULATIVE LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU IN THE 3 MONTHS PRECEDING THE CLAIM.</p>
        </Section>
        <Section title="9. Indemnification">
          <p>You agree to indemnify and hold harmless Effora from any claims, damages, or expenses (including legal fees) arising from: your use of the Service, your violation of these Terms, your violation of third-party rights, or your messaging activities.</p>
        </Section>
        <Section title="10. Disclaimer of warranties">
          <p>THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTIES OF ANY KIND. WE DO NOT WARRANT UNINTERRUPTED, ERROR-FREE, OR SECURE OPERATION. AI-GENERATED MESSAGES ARE SUGGESTIONS — YOU ARE RESPONSIBLE FOR ALL COMMUNICATIONS SENT FROM YOUR ACCOUNT.</p>
        </Section>
        <Section title="11. Termination">
          <p>We may suspend or terminate your account for violation of these Terms, non-payment, or at our discretion with 30 days&apos; notice. You may terminate by deleting your account. Upon termination, your data will be deleted per our Privacy Policy.</p>
        </Section>
        <Section title="12. Dispute resolution">
          <p>Disputes shall first be attempted to be resolved by good-faith negotiation. If unresolved within 30 days, disputes shall be submitted to binding arbitration under the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration is Pune, Maharashtra.</p>
          <p className="mt-2"><strong>Governing law:</strong> Laws of India. <strong>Jurisdiction:</strong> Courts of Pune, Maharashtra, India.</p>
        </Section>
        <Section title="13. Changes to terms">
          <p>We will notify users of material changes by email 14 days in advance. Continued use after the effective date constitutes acceptance of the updated terms.</p>
        </Section>
        <Section title="Contact">
          <p>Questions about these Terms: <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a></p>
        </Section>
      </main>
      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--text-3)]">
        © {new Date().getFullYear()} Effora AI · <Link href="/terms" className="hover:underline">Terms</Link> · <Link href="/privacy" className="hover:underline">Privacy</Link> · {CONTACT}
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="text-[var(--text-2)] leading-relaxed text-sm">{children}</div>
    </section>
  );
}
