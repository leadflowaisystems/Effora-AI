"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  CalendarDays, CheckCircle2, AlertTriangle,
  Clock, ChevronDown, ChevronRight,
} from "lucide-react";
import { BookingCard, type BookingRow } from "./booking-card";
import { SimulateBookingSheet, type SimulateLead } from "./simulate-booking-sheet";
import { ManualBookingSheet } from "./manual-booking-sheet";
import { cn } from "@/lib/utils";

interface Props {
  initialBookings: BookingRow[];
  orgSlug:         string;
  orgId:           string;
  /** True in non-production environments — shows the Simulate booking button. */
  isDev:           boolean;
  /** Leads available for the simulate form picker. Only used when isDev=true. */
  leads:           SimulateLead[];
}

type Group = {
  key:   string;
  label: string;
  icon:  React.ElementType;
  color: string;
  rows:  BookingRow[];
};

function groupBookings(bookings: BookingRow[]): Group[] {
  const now = Date.now();

  const upcoming  = bookings.filter(
    (b) => b.status === "confirmed" && b.starts_at && new Date(b.starts_at).getTime() > now
  );
  const completed = bookings.filter((b) => b.status === "completed");
  const noShows   = bookings.filter((b) => b.status === "no_show");
  const cancelled = bookings.filter((b) => b.status === "cancelled");
  const pending   = bookings.filter(
    (b) => b.status === "confirmed" && (!b.starts_at || new Date(b.starts_at).getTime() <= now)
  );

  const groups: Group[] = [];

  if (upcoming.length || pending.length) {
    groups.push({
      key:   "upcoming",
      label: "Upcoming",
      icon:  CalendarDays,
      color: "text-emerald-400",
      rows:  [...pending, ...upcoming].sort(
        (a, b) =>
          new Date(a.starts_at ?? 0).getTime() - new Date(b.starts_at ?? 0).getTime()
      ),
    });
  }

  if (noShows.length) {
    groups.push({
      key:   "no-shows",
      label: "No-Shows",
      icon:  AlertTriangle,
      color: "text-red-400",
      rows:  noShows.sort(
        (a, b) => new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime()
      ),
    });
  }

  if (completed.length) {
    groups.push({
      key:   "completed",
      label: "Completed",
      icon:  CheckCircle2,
      color: "text-[var(--brand)]",
      rows:  completed.sort(
        (a, b) => new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime()
      ),
    });
  }

  if (cancelled.length) {
    groups.push({
      key:   "cancelled",
      label: "Cancelled",
      icon:  Clock,
      color: "text-[var(--text-3)]",
      rows:  cancelled.sort(
        (a, b) => new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime()
      ),
    });
  }

  return groups;
}

function SectionHeader({
  group,
  open,
  onToggle,
}: {
  group: Group;
  open:  boolean;
  onToggle: () => void;
}) {
  const Icon = group.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 py-1.5 text-left select-none group"
    >
      <Icon className={cn("h-4 w-4 shrink-0", group.color)} />
      <span className={cn("text-sm font-semibold", group.color)}>{group.label}</span>
      <span className="ml-1 text-xs text-[var(--text-3)]">({group.rows.length})</span>
      <span className="ml-auto text-[var(--text-3)] group-hover:text-[var(--text-2)] transition-colors">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </span>
    </button>
  );
}

export function BookingsView({ initialBookings, orgSlug, orgId, isDev, leads }: Props) {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingRow[]>(initialBookings);
  const [open, setOpen] = useState<Record<string, boolean>>({ upcoming: true, "no-shows": true });

  const handleUpdate = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/bookings`);
    if (res.ok) {
      const json = await res.json();
      setBookings(json.bookings ?? []);
    }
    router.refresh();
  }, [orgId, router]);

  const groups = groupBookings(bookings);

  // Dev bar — shown in both empty and populated states
  const actionBar = (
    <div className="flex flex-wrap items-center gap-2">
      <ManualBookingSheet orgId={orgId} leads={leads} onDone={handleUpdate} />
      {isDev && (
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
          <span className="text-[11px] text-amber-500/70 font-mono uppercase tracking-wide">dev</span>
          <SimulateBookingSheet orgId={orgId} leads={leads} onDone={handleUpdate} />
        </div>
      )}
    </div>
  );
  const devBar = actionBar;

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        {devBar}
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-3)]">
            <CalendarDays className="h-7 w-7 text-[var(--text-3)]" />
          </div>
          <div className="space-y-1 max-w-xs">
            <p className="font-display text-base font-semibold text-[var(--text)]">No bookings yet</p>
            <p className="text-sm text-[var(--text-3)] leading-relaxed">
              {isDev
                ? "Use the Simulate button above to create a test booking and watch reminders fire."
                : "Bookings appear here after a hot lead clicks your Cal.com link and confirms a call."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {devBar}
      {groups.map((group) => {
        const isOpen = open[group.key] !== false;
        return (
          <div key={group.key} className="space-y-3">
            <SectionHeader
              group={group}
              open={isOpen}
              onToggle={() => setOpen((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
            />
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 pb-1">
                    {group.rows.map((b) => (
                      <BookingCard
                        key={b.id}
                        booking={b}
                        orgSlug={orgSlug}
                        orgId={orgId}
                        onUpdate={handleUpdate}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
