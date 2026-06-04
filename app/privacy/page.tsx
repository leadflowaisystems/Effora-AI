import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Effora AI",
  description: "How Effora AI collects, uses, and protects your personal data.",
};

const UPDATED = "1 June 2025";
const CONTACT = "leadflowai.systems@gmail.com";

export default function PrivacyPage() {
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
          <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
          <p className="mt-2 text-sm text-[var(--text-3)]">Last updated: {UPDATED}</p>
        </div>
        <Section title="1. Who we are">
          <p>Effora AI ("Effora", "we", "us") is a SaaS platform operated by Leadflow AI Systems. We help service businesses — primarily coaches and consultants — manage their Instagram DM and WhatsApp inbox, automate booking and payment workflows, and grow their client base.</p>
          <p className="mt-2">Contact: <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a></p>
        </Section>
        <Section title="2. Data we collect">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account data:</strong> your name, email address, and password hash when you register.</li>
            <li><strong>Business data:</strong> your organisation name, voice profile (tone, offer), and configuration settings.</li>
            <li><strong>Lead data:</strong> names, Instagram handles, phone numbers, email addresses, and conversation history for your leads — entered by you or automatically captured from connected channels.</li>
            <li><strong>Messages:</strong> the content of Instagram DMs and WhatsApp messages exchanged between your leads and your account. We store these to power the AI reply feature and your inbox.</li>
            <li><strong>Booking and payment data:</strong> meeting dates/times, booking links, payment amounts, and transaction references (Razorpay order IDs). We do not store full card numbers.</li>
            <li><strong>Usage data:</strong> page views, feature usage events, error logs — collected to improve the service.</li>
            <li><strong>Device and access logs:</strong> IP addresses, browser type, and access timestamps for security auditing.</li>
          </ul>
        </Section>
        <Section title="3. How we use your data">
          <ul className="list-disc pl-5 space-y-1">
            <li>Operate and display your inbox, CRM, bookings, and payments dashboards.</li>
            <li>Generate AI-drafted replies in your voice (content is sent to Groq's API — see §5).</li>
            <li>Send booking confirmation and payment reminder messages on your behalf.</li>
            <li>Send transactional emails (booking confirmations, payment receipts) via Brevo.</li>
            <li>Process subscription payments via Razorpay.</li>
            <li>Provide customer support when you contact us.</li>
            <li>Detect and prevent fraud, abuse, and security incidents.</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p className="mt-2">We do not sell your data to third parties. We do not use your leads' data for advertising.</p>
        </Section>
        <Section title="4. Retention">
          <p>We retain your data for as long as your account is active. If you delete your account, we delete all associated data within 30 days, except where we are legally required to retain it (e.g., financial records for 7 years under Indian law).</p>
          <p className="mt-2">Inactive accounts (no login for 18 months) may be deleted after 30-day notice by email.</p>
        </Section>
        <Section title="5. Third-party services">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 pr-4">Service</th>
                <th className="text-left py-2 pr-4">Purpose</th>
                <th className="text-left py-2">Data shared</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {[
                ["Supabase", "Database + auth", "All user and app data"],
                ["Vercel", "Hosting + CDN", "Request logs, IP addresses"],
                ["Groq API", "AI message generation", "Message content (no PII beyond conversation context)"],
                ["Meta (Instagram / WhatsApp)", "Channel integration", "Message content, user IDs"],
                ["Razorpay", "Payment processing", "Payment amounts, customer name"],
                ["Brevo", "Transactional email", "Recipient email, name"],
                ["Cal.com", "Calendar booking", "Meeting times, attendee name"],
                ["Upstash", "Rate limiting cache", "Request identifiers only"],
              ].map(([s, p, d]) => (
                <tr key={s}>
                  <td className="py-2 pr-4 font-medium">{s}</td>
                  <td className="py-2 pr-4 text-[var(--text-2)]">{p}</td>
                  <td className="py-2 text-[var(--text-3)]">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="6. Your rights">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access:</strong> request a copy of all data we hold about you.</li>
            <li><strong>Correction:</strong> ask us to fix inaccurate data.</li>
            <li><strong>Deletion:</strong> request deletion of your account and all associated data (see §7).</li>
            <li><strong>Portability:</strong> export your leads, bookings, and payments data as CSV from within the app (<em>Settings → Account → Export data</em>).</li>
            <li><strong>Withdraw consent:</strong> disconnect any channel integration at any time from <em>Settings → Channel</em>.</li>
            <li><strong>GDPR (EU/EEA users):</strong> you also have the right to object to processing and to lodge a complaint with your local supervisory authority.</li>
          </ul>
          <p className="mt-2">To exercise these rights, email <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a>.</p>
        </Section>
        <Section title="7. Data deletion">
          <p>To delete your account and all associated data:</p>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>In the app: <em>Settings → Account → Delete account</em>.</li>
            <li>By email: send a deletion request to <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a> with subject "Data deletion request" and your registered email address.</li>
          </ol>
          <p className="mt-2">We process deletion requests within 30 days. See also our <Link href="/data-deletion" className="text-[var(--brand)] underline">Data Deletion Instructions page</Link>.</p>
        </Section>
        <Section title="8. Cookies">
          <p>We use strictly necessary cookies (session tokens for authentication) and basic analytics cookies. No advertising or tracking cookies are used. You can disable cookies in your browser but this will prevent login from working.</p>
        </Section>
        <Section title="9. Security">
          <p>We implement industry-standard security: TLS 1.3 in transit, AES-256-GCM encryption for sensitive credentials at rest, access controls, and regular security audits. See our <Link href="/security" className="text-[var(--brand)] underline">Security page</Link> for details.</p>
        </Section>
        <Section title="10. Children">
          <p>Effora is not directed at children under 13. We do not knowingly collect data from children. If you believe a child has registered, contact us immediately.</p>
        </Section>
        <Section title="11. Changes to this policy">
          <p>We will notify you by email at least 14 days before material changes take effect. Continued use of the service after the effective date constitutes acceptance.</p>
        </Section>
        <Section title="12. Governing law">
          <p>This policy is governed by the Information Technology Act 2000 (India) and, where applicable, the GDPR. Disputes are subject to the jurisdiction of courts in Pune, Maharashtra, India.</p>
        </Section>
        <Section title="Contact">
          <p>Privacy questions: <a href={`mailto:${CONTACT}`} className="text-[var(--brand)] underline">{CONTACT}</a></p>
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
