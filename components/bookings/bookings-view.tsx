"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  CalendarDays, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronRight,
  RefreshCw, Loader2, PlusCircle,
} from "lucide-react";
import { BookingCard, type BookingRow } from "./booking-card";
import { RecurringBookingCard, type RecurringBookingRow } from "./recurring-booking-card";
import { SimulateBookingSheet, type SimulateLead } from "./simulate-booking-sheet";
import { ManualBookingSheet, type ManualBookingGroup } from "./manual-booking-sheet";
import { TimeRangeFilter, readStoredFilter } from "@/components/filters/time-range-filter";
import { SubCategoryTabs } from "@/components/filters/sub-category-tabs";
import { parseRange, getRangeBounds, getFutureBounds, isInRange, isInFutureRange, type Range } from "@/lib/range";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const STORAGE_KEY = "effora-bookings-filter";

type Category = "all" | "upcoming" | "completed" | "no_show" | "recurring";

const CATEGORY_TABS = [
  { value: "all"       as Category, label: "All"       },
  { value: "upcoming"  as Category, label: "Upcoming"  },
  { value: "completed" as Category, label: "Completed" },
  { value: "no_show"   as Category, label: "No Show"   },
  { value: "recurring" as Category, label: "Recurring" },
];

interface Props {
  initialBookings: BookingRow[];
  orgSlug:         string;
  orgId:           string;
  isDev:           boolean;
  leads:           SimulateLead[];
  groups?:         ManualBookingGroup[];
}

interface BookingStats {
  total: number; upcoming: number; completed: number; no_shows: number; completion_rate: number;
}

// ── Month-grouped view for Upcoming ──────────────────────────────────────────
function groupByMonth(bookings: BookingRow[]): Array<{ key: string; label: string; rows: BookingRow[] }> {
  const groups = new Map<string, BookingRow[]>();
  const sorted = [...bookings].sort((a, b) =>
    new Date(a.starts_at ?? 0).getTime() - new Date(b.starts_at ?? 0).getTime()
  );
  for (const b of sorted) {
    const d = b.starts_at ? new Date(b.starts_at) : null;
    const key = d
      ? d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
      : "Unscheduled";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }
  return Array.from(groups.entries()).map(([label, rows]) => ({ key: label, label, rows }));
}

// ── Status-grouped view (All / Completed / No Show) ──────────────────────────
function groupByStatus(bookings: BookingRow[], category: Category): Array<{ key: string; label: string; icon: React.ElementType; color: string; rows: BookingRow[] }> {
  const now  = Date.now();
  const sort = (arr: BookingRow[]) =>
    [...arr].sort((a, b) => new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime());

  const groups = [];

  if (category === "all") {
    const upcoming  = bookings.filter((b) => b.status === "confirmed" && b.starts_at && new Date(b.starts_at).getTime() > now);
    const pending   = bookings.filter((b) => b.status === "confirmed" && (!b.starts_at || new Date(b.starts_at).getTime() <= now));
    const completed = bookings.filter((b) => b.status === "completed");
    const noShows   = bookings.filter((b) => b.status === "no_show");
    const cancelled = bookings.filter((b) => b.status === "cancelled");
    const upcomingRows = [...pending, ...upcoming].sort((a, b) => new Date(a.starts_at ?? 0).getTime() - new Date(b.starts_at ?? 0).getTime());
    if (upcomingRows.length)  groups.push({ key: "upcoming",  label: "Upcoming",  icon: CalendarDays, color: "text-emerald-400",     rows: upcomingRows });
    if (noShows.length)       groups.push({ key: "no-shows",  label: "No-Shows",  icon: AlertTriangle,color: "text-red-400",          rows: sort(noShows) });
    if (completed.length)     groups.push({ key: "completed", label: "Completed", icon: CheckCircle2, color: "text-[var(--brand)]",  rows: sort(completed) });
    if (cancelled.length)     groups.push({ key: "cancelled", label: "Cancelled", icon: Clock,        color: "text-[var(--text-3)]", rows: sort(cancelled) });
  } else if (category === "completed") {
    const completed = bookings.filter((b) => b.status === "completed");
    if (completed.length) groups.push({ key: "completed", label: "Completed", icon: CheckCircle2, color: "text-[var(--brand)]", rows: sort(completed) });
  } else if (category === "no_show") {
    const noShows = bookings.filter((b) => b.status === "no_show");
    if (noShows.length) groups.push({ key: "no-shows", label: "No-Shows", icon: AlertTriangle, color: "text-red-400", rows: sort(noShows) });
  }
  return groups;
}

function SectionHeader({ label, icon: Icon, color, count, open, onToggle }: {
  label: string; icon: React.ElementType; color: string; count: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 py-1.5 text-left select-none group">
      <Icon className={cn("h-4 w-4 shrink-0", color)} />
      <span className={cn("text-sm font-semibold", color)}>{label}</span>
      <span className="ml-1 text-xs text-[var(--text-3)]">({count})</span>
      <span className="ml-auto text-[var(--text-3)] group-hover:text-[var(--text-2)] transition-colors">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </span>
    </button>
  );
}

function MonthHeader({ label, count, open, onToggle }: {
  label: string; count: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 py-1.5 text-left select-none group">
      <CalendarDays className="h-4 w-4 shrink-0 text-emerald-400" />
      <span className="text-sm font-semibold text-emerald-400">{label}</span>
      <span className="ml-1 text-xs text-[var(--text-3)]">— {count} booking{count !== 1 ? "s" : ""}</span>
      <span className="ml-auto text-[var(--text-3)] group-hover:text-[var(--text-2)] transition-colors">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </span>
    </button>
  );
}

function StatTile({ label, value, color, loading }: { label: string; value: string | number; color: string; loading: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-1">
      <p className="text-xs text-[var(--text-3)]">{label}</p>
      {loading
        ? <div className="h-7 w-12 rounded-[var(--radius-sm)] bg-[var(--bg-3)] animate-pulse" />
        : <p className={cn("font-mono text-xl font-semibold tabular-nums", color)}>{value}</p>
      }
    </div>
  );
}

function CollapsibleRows({ rows, orgSlug, orgId, onUpdate, onDelete }: {
  rows: BookingRow[]; orgSlug: string; orgId: string; onUpdate: () => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3 pb-1">
      {rows.map((b) => (
        <BookingCard key={b.id} booking={b} orgSlug={orgSlug} orgId={orgId} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
    </div>
  );
}

export function BookingsView({ initialBookings, orgSlug, orgId, isDev, leads, groups = [] }: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const [category, setCategory] = useState<Category>(() => {
    const u = (searchParams.get("cat") ?? "") as Category;
    return ["upcoming", "completed", "no_show", "recurring"].includes(u) ? u : "all";
  });
  const [range, setRange]           = useState<Range>(() => {
    const stored = readStoredFilter(STORAGE_KEY);
    return stored?.range ?? parseRange(searchParams.get("range"));
  });
  const [customFrom, setCustomFrom] = useState<string | null>(() => readStoredFilter(STORAGE_KEY)?.from ?? null);
  const [customTo,   setCustomTo]   = useState<string | null>(() => readStoredFilter(STORAGE_KEY)?.to   ?? null);

  const [bookings, setBookings]         = useState<BookingRow[]>(initialBookings);
  const [open, setOpen]                 = useState<Record<string, boolean>>({});
  const [stats, setStats]               = useState<BookingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // Recurring state
  const [recurring, setRecurring]               = useState<RecurringBookingRow[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [rTarget, setRTarget] = useState<"lead"|"group">("lead");
  const [rLead,   setRLead]   = useState("");
  const [rGroup,  setRGroup]  = useState("");
  const [rName,   setRName]   = useState("");
  const [rNotes,  setRNotes]  = useState("");
  const [rFreq,   setRFreq]   = useState<"daily"|"weekly"|"monthly"|"yearly">("weekly");
  const [rStartAt, setRStartAt] = useState<string>(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [rSaving, setRSaving] = useState(false);

  const loadRecurring = useCallback(async () => {
    setRecurringLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/bookings/recurring`);
      if (res.ok) {
        const json = await res.json();
        setRecurring(json.recurring ?? []);
      }
    } finally { setRecurringLoading(false); }
  }, [orgId]);

  useEffect(() => {
    if (category === "recurring") loadRecurring();
  }, [category, loadRecurring]);

  async function createRecurring(e: React.FormEvent) {
    e.preventDefault();
    const hasTarget = rTarget === "lead" ? !!rLead : !!rGroup;
    if (!hasTarget || !rName) return;
    setRSaving(true);
    try {
      const firstRunAt = rStartAt ? new Date(rStartAt).toISOString() : undefined;
      const body: Record<string, unknown> = {
        template_name:        rName,
        notes:                rNotes || undefined,
        recurrence_frequency: rFreq,
        first_run_at:         firstRunAt,
      };
      if (rTarget === "lead")  body.lead_id  = rLead;
      else                     body.group_id = rGroup;

      const res = await fetch(`/api/orgs/${orgId}/bookings/recurring`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const created = (data as { created?: number }).created ?? 1;
      toast({ title: created > 1 ? `${created} recurring bookings created` : "Recurring booking created", variant: "success" });
      setShowRecurringForm(false);
      setRLead(""); setRGroup(""); setRName(""); setRNotes("");
      loadRecurring();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally { setRSaving(false); }
  }

  const fetchStats = useCallback(async (r: Range, cat: Category, cf?: string | null, ct?: string | null) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatsLoading(true);
    try {
      const p = new URLSearchParams({ range: r, category: cat });
      if (r === "custom" && cf) p.set("from", cf);
      if (r === "custom" && ct) p.set("to", ct);
      const res = await fetch(`/api/orgs/${orgId}/bookings/stats?${p}`, { signal: ctrl.signal });
      if (!res.ok) return;
      const json = await res.json();
      setStats({ total: json.total, upcoming: json.upcoming, completed: json.completed, no_shows: json.no_shows, completion_rate: json.completion_rate });
    } catch { /* aborted */ }
    finally { setStatsLoading(false); }
  }, [orgId]);

  const syncUrl = useCallback((r: Range, cat: Category) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("range", r); p.set("cat", cat);
    router.replace(`${pathname}?${p}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const handleRangeChange = useCallback((r: Range, cf?: string | null, ct?: string | null) => {
    setRange(r); setCustomFrom(cf ?? null); setCustomTo(ct ?? null);
    fetchStats(r, category, cf, ct);
    syncUrl(r, category);
  }, [fetchStats, category, syncUrl]);

  const handleCategoryChange = useCallback((cat: Category) => {
    setCategory(cat);
    fetchStats(range, cat, customFrom, customTo);
    syncUrl(range, cat);
  }, [fetchStats, range, customFrom, customTo, syncUrl]);

  useEffect(() => { fetchStats(range, category, customFrom, customTo); }, []); // eslint-disable-line

  const handleUpdate = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/bookings`);
    if (res.ok) { const json = await res.json(); setBookings(json.bookings ?? []); }
    fetchStats(range, category, customFrom, customTo);
    router.refresh();
  }, [orgId, router, fetchStats, range, category, customFrom, customTo]);

  const handleDelete = useCallback((id: string) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: prev[key] === false ? true : false }));
  const isOpen = (key: string) => open[key] !== false; // default open

  // Apply the SAME filter to the row list: range + category.
  // Upcoming: forward-looking window; Completed/No Show/All: backward-looking.
  const { from: rangeFrom, to: rangeTo } = getRangeBounds(range, customFrom, customTo);
  const { from: futureFrom, to: futureTo } = getFutureBounds(range, customTo);

  const visibleBookings = bookings.filter((b) => {
    if (category === "recurring") return false; // handled separately
    if (category === "upcoming") {
      return b.status === "confirmed" && isInFutureRange(b.starts_at, range, futureTo);
    }
    if (category === "completed") {
      return b.status === "completed" && isInRange(b.starts_at ?? b.created_at, range, rangeFrom, rangeTo);
    }
    if (category === "no_show") {
      return b.status === "no_show" && isInRange(b.starts_at ?? b.created_at, range, rangeFrom, rangeTo);
    }
    // "all" — include everything within the range window
    return isInRange(b.created_at, range, rangeFrom, rangeTo);
  });

  // Suppress TS "declared but never read" for futureFrom (used above in closure)
  void futureFrom;

  const devBar = (
    <div className="flex flex-wrap items-center gap-2">
      <ManualBookingSheet orgId={orgId} leads={leads} groups={groups} onDone={handleUpdate} />
      {isDev && (
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
          <span className="text-[11px] text-amber-500/70 font-mono uppercase tracking-wide">dev</span>
          <SimulateBookingSheet orgId={orgId} leads={leads} onDone={handleUpdate} />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      {devBar}

      {/* ── Sub-category + range filter row ─────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubCategoryTabs options={CATEGORY_TABS} value={category} onChange={handleCategoryChange} />
        <TimeRangeFilter storageKey={STORAGE_KEY} value={range} customFrom={customFrom} customTo={customTo} onChange={handleRangeChange} />
      </div>

      {/* ── Metric tiles ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total"       value={stats?.total           ?? 0} color="text-[var(--text)]"   loading={statsLoading} />
        <StatTile label="Upcoming"    value={stats?.upcoming        ?? 0} color="text-emerald-400"      loading={statsLoading} />
        <StatTile label="Completed"   value={stats?.completed       ?? 0} color="text-[var(--brand)]"  loading={statsLoading} />
        <StatTile label="Completion %" value={`${stats?.completion_rate ?? 0}%`} color="text-blue-400" loading={statsLoading} />
      </div>

      {/* ── Empty state (non-recurring) ──────────────────── */}
      {category !== "recurring" && visibleBookings.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-3)]">
            <CalendarDays className="h-7 w-7 text-[var(--text-3)]" />
          </div>
          <div className="space-y-1 max-w-xs">
            <p className="font-display text-base font-semibold text-[var(--text)]">No bookings in this range</p>
            <p className="text-sm text-[var(--text-3)] leading-relaxed">
              {isDev ? "Use Simulate above to create a test booking." : "Try a wider time range or check other categories."}
            </p>
          </div>
        </div>
      )}

      {/* ── Recurring tab ────────────────────────────────── */}
      {category === "recurring" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRecurringForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-emerald-500/30 bg-emerald-500/8 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/15 transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" /> New recurring booking
            </button>
            <button onClick={loadRecurring} disabled={recurringLoading}
              className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
              <RefreshCw className={cn("h-3 w-3", recurringLoading && "animate-spin")} /> Refresh
            </button>
          </div>

          {/* Create recurring form */}
          {showRecurringForm && (
            <form onSubmit={createRecurring} className="rounded-[var(--radius-md)] border border-emerald-500/20 bg-[var(--bg-2)] p-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--text)]">New recurring booking</p>

              {/* Individual / Group toggle */}
              <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] p-0.5 w-fit">
                {(["lead","group"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setRTarget(t)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-[var(--radius-sm)] transition-colors",
                      rTarget === t ? "bg-[var(--brand)] text-[#0A0A0C]" : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                    )}>
                    {t === "lead" ? "Individual lead" : "Group"}
                  </button>
                ))}
              </div>

              {rTarget === "lead" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">Lead *</label>
                  <select value={rLead} onChange={(e) => setRLead(e.target.value)} required
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]">
                    <option value="">Select lead…</option>
                    {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? "Unnamed"}</option>)}
                  </select>
                </div>
              )}

              {rTarget === "group" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">Group *</label>
                  <select value={rGroup} onChange={(e) => setRGroup(e.target.value)} required
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]">
                    <option value="">Select group…</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.member_count ?? 0} members)</option>)}
                  </select>
                  {groups.length === 0 && (
                    <p className="text-[11px] text-[var(--text-3)]">No groups yet — create one in the Groups section.</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">Session name *</label>
                  <input value={rName} onChange={(e) => setRName(e.target.value)} required placeholder="Weekly Coaching Call"
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">Frequency *</label>
                  <select value={rFreq} onChange={(e) => setRFreq(e.target.value as typeof rFreq)}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Start date &amp; time *</label>
                <input type="datetime-local" value={rStartAt} onChange={(e) => setRStartAt(e.target.value)} required
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]" />
                <p className="text-[11px] text-[var(--text-3)]">First session scheduled at this time. Subsequent sessions follow the frequency.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Notes</label>
                <input value={rNotes} onChange={(e) => setRNotes(e.target.value)} placeholder="e.g. 1-on-1 strategy session"
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowRecurringForm(false)}
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={rSaving}
                  className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 flex items-center gap-1 transition-opacity">
                  {rSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {rSaving ? "Creating…" : rTarget === "group" ? "Create for group" : "Create"}
                </button>
              </div>
            </form>
          )}

          {recurringLoading && (
            <div className="space-y-2">
              {[1,2,3].map((i) => <div key={i} className="h-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] animate-pulse" />)}
            </div>
          )}
          {!recurringLoading && recurring.length === 0 && !showRecurringForm && (
            <div className="text-center py-10 text-sm text-[var(--text-3)]">No recurring bookings set up yet.</div>
          )}
          {!recurringLoading && recurring.map((r) => (
            <RecurringBookingCard
              key={r.id}
              booking={r}
              orgId={orgId}
              onUpdate={loadRecurring}
              onDelete={(id) => setRecurring((prev) => prev.filter((b) => b.id !== id))}
            />
          ))}
        </div>
      )}

      {/* ── Upcoming: month-grouped view ─────────────────── */}
      {category === "upcoming" && visibleBookings.length > 0 && (
        <div className="space-y-6">
          {groupByMonth(visibleBookings).map((monthGroup) => (
            <div key={monthGroup.key} className="space-y-3">
              <MonthHeader
                label={monthGroup.label}
                count={monthGroup.rows.length}
                open={isOpen(monthGroup.key)}
                onToggle={() => toggle(monthGroup.key)}
              />
              <AnimatePresence initial={false}>
                {isOpen(monthGroup.key) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden pl-2 border-l-2 border-emerald-500/20 ml-2"
                  >
                    <CollapsibleRows rows={monthGroup.rows} orgSlug={orgSlug} orgId={orgId} onUpdate={handleUpdate} onDelete={handleDelete} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* ── All / Completed / No Show: status-grouped view ── */}
      {category !== "upcoming" && visibleBookings.length > 0 && (
        <div className="space-y-6">
          {groupByStatus(visibleBookings, category).map((group) => (
            <div key={group.key} className="space-y-3">
              <SectionHeader
                label={group.label} icon={group.icon} color={group.color}
                count={group.rows.length} open={isOpen(group.key)}
                onToggle={() => toggle(group.key)}
              />
              <AnimatePresence initial={false}>
                {isOpen(group.key) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <CollapsibleRows rows={group.rows} orgSlug={orgSlug} orgId={orgId} onUpdate={handleUpdate} onDelete={handleDelete} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
