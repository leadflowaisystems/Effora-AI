"use client";

/**
 * GettingStartedPanel — what a real institute owner sees on day 1.
 *
 * The analytics dashboard is meaningless with 0–5 enquiries: every tile reads
 * ₹0, every conversion reads "–", and the charts are flat lines. That looks
 * broken, not new. This panel replaces them until there is enough real data to
 * plot, and answers the only three questions a new client actually has:
 *
 *   1. Is it on?
 *   2. What happens when someone messages me?
 *   3. How do I check it works right now?
 *
 * Every number shown here is real. Nothing on this panel is sample data.
 */

import Link from "next/link";
import { Check, ArrowRight, MessageSquare, Sparkles, CalendarCheck, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SetupStatus {
  whatsappConnected:  boolean;
  /** Display number, e.g. "+91 98765 43210". Null when not connected. */
  whatsappNumber:     string | null;
  aiActive:           boolean;
  calendarConnected:  boolean;
  paymentsConnected:  boolean;
  orgSlug:            string;
  /** Real count of enquiries received in the current range. */
  enquiryCount:       number;
}

function StatusRow({
  ok, label, icon: Icon, href, ctaLabel,
}: {
  ok:        boolean;
  label:     string;
  icon:      React.ComponentType<{ className?: string }>;
  href?:     string;
  ctaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-[var(--brand)]/12 text-[var(--brand)]" : "bg-[var(--bg-3)] text-[var(--text-3)]",
        )}
      >
        {ok ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      </div>
      <span className={cn("text-sm flex-1", ok ? "text-[var(--text)]" : "text-[var(--text-2)]")}>
        {label}
      </span>
      {ok ? (
        <span className="text-xs font-medium text-[var(--brand)]">Active</span>
      ) : href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
        >
          {ctaLabel ?? "Set up"} <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}

export function GettingStartedPanel({ setup }: { setup: SetupStatus }) {
  const {
    whatsappConnected, whatsappNumber, aiActive,
    calendarConnected, paymentsConnected, orgSlug, enquiryCount,
  } = setup;

  const live = whatsappConnected && aiActive;

  return (
    <div className="space-y-4">
      {/* ── Live banner ─────────────────────────────────────── */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">
            {live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand)] opacity-60" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                live ? "bg-[var(--brand)]" : "bg-[var(--text-3)]",
              )}
            />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-[var(--text)]">
              {live ? "Live & listening" : "Almost ready"}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              {live
                ? enquiryCount === 0
                  ? "Your WhatsApp number is connected. The moment a parent or student messages you, it appears here."
                  : `${enquiryCount} ${enquiryCount === 1 ? "enquiry" : "enquiries"} so far. Charts appear once you cross 5 — until then the numbers below are the full picture.`
                : "Finish the steps below and your enquiries will start flowing in automatically."}
            </p>
          </div>
        </div>

        {/* ── Status checklist ──────────────────────────────── */}
        <div className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)] pt-1">
          <StatusRow
            ok={whatsappConnected}
            icon={MessageSquare}
            label={
              whatsappConnected && whatsappNumber
                ? `WhatsApp connected — ${whatsappNumber}`
                : "Connect your WhatsApp Business number"
            }
            href={`/org/${orgSlug}/settings/whatsapp`}
            ctaLabel="Connect"
          />
          <StatusRow
            ok={aiActive}
            icon={Sparkles}
            label="AI reads every enquiry and drafts a reply in your voice"
            href={`/org/${orgSlug}/settings`}
            ctaLabel="Enable"
          />
          <StatusRow
            ok={calendarConnected}
            icon={CalendarCheck}
            label="Demo class / counselling bookings"
            href={`/org/${orgSlug}/onboarding`}
            ctaLabel="Add calendar"
          />
          <StatusRow
            ok={paymentsConnected}
            icon={IndianRupee}
            label="Collect fees over WhatsApp"
            href={`/org/${orgSlug}/settings/payments`}
            ctaLabel="Add payments"
          />
        </div>
      </div>

      {/* ── What happens next ───────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            n: "1",
            title: "A parent messages you",
            body: "Their enquiry lands in your inbox instantly — name, number and question, all captured.",
          },
          {
            n: "2",
            title: "AI qualifies and drafts",
            body: "It works out how serious they are, then writes a reply in your institute's tone. Hot leads get flagged.",
          },
          {
            n: "3",
            title: "You approve and send",
            body: "One tap. Booking and fee links go out automatically, and you get a notification the moment they act.",
          },
        ].map((s) => (
          <div
            key={s.n}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-3)] text-xs font-semibold text-[var(--text-2)]">
              {s.n}
            </span>
            <h3 className="mt-2.5 text-sm font-semibold text-[var(--text)]">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">{s.body}</p>
          </div>
        ))}
      </div>

      {/* ── Test prompt ─────────────────────────────────────── */}
      {whatsappConnected && whatsappNumber && (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--bg-2)]/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-[var(--text)]">See it work in 30 seconds</h3>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            From your personal phone, send a WhatsApp message to{" "}
            <span className="font-medium text-[var(--text)]">{whatsappNumber}</span> — try
            something a parent would actually ask, like{" "}
            <span className="italic">&ldquo;fees kya hai JEE batch ka?&rdquo;</span> It will show
            up in your inbox within seconds.
          </p>
          <Link
            href={`/org/${orgSlug}/inbox`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-3)]/70"
          >
            Open inbox <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
