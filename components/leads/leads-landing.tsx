"use client";

/**
 * LeadsLanding — the /leads section landing page.
 * Shows the search selector + an empty state guiding the user to search.
 */

import { UserCircle, Search, ArrowRight } from "lucide-react";
import { LeadSearchSelector } from "./lead-search-selector";

interface Props {
  orgId:    string;
  orgSlug:  string;
}

export function LeadsLanding({ orgId, orgSlug }: Props) {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Leads</h1>
        <p className="text-sm text-[var(--text-3)]">
          Search for any lead to view their full profile — bookings, payments, notes, and activity.
        </p>
      </div>

      {/* Selector */}
      <LeadSearchSelector orgId={orgId} orgSlug={orgSlug} />

      {/* Empty / instructional state */}
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center max-w-sm mx-auto">
        <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--bg-3)] border border-[var(--border)]">
          <UserCircle className="h-8 w-8 text-[var(--text-3)]" />
        </div>
        <div className="space-y-2">
          <p className="font-display text-base font-semibold text-[var(--text)]">
            Find any lead instantly
          </p>
          <p className="text-sm text-[var(--text-3)] leading-relaxed">
            Type a name, Instagram handle, or phone number above to pull up their complete profile.
          </p>
        </div>

        {/* Feature hints */}
        <div className="w-full space-y-2 text-left">
          {[
            "Activity timeline — every message, booking, payment",
            "Inline notes you can edit and save",
            "Quick actions: book, pay, message",
            "Export to CSV",
          ].map((text) => (
            <div key={text} className="flex items-start gap-2.5 text-xs text-[var(--text-3)]">
              <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--brand)]" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
