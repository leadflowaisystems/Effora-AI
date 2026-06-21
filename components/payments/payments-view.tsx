"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { IndianRupee, CheckCircle2, Clock, XCircle, ChevronDown, ChevronRight, RefreshCw, Loader2, PlusCircle } from "lucide-react";
import { PaymentCard, type PaymentRow } from "./payment-card";
import { RecurringPaymentCard, type RecurringPaymentRow } from "./recurring-payment-card";
import { SimulatePaymentSheet, type SimulateLead } from "./simulate-payment-sheet";
import { PaymentActionsSheet, type PaymentActionGroup } from "./payment-actions-sheet";
import { ManualPaymentSheet, type ManualPaymentGroup } from "./manual-payment-sheet";
import type { PaymentMode } from "@/app/(app)/org/[orgSlug]/settings/payments/payment-mode-form-client";
import { TimeRangeFilter, readStoredFilter } from "@/components/filters/time-range-filter";
import { SubCategoryTabs } from "@/components/filters/sub-category-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { parseRange, getRangeBounds, isInRange, type Range } from "@/lib/range";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const STORAGE_KEY = "effora-payments-filter";

type Category = "all" | "paid" | "pending" | "recurring";

const CATEGORY_TABS = [
  { value: "all"       as Category, label: "All"       },
  { value: "paid"      as Category, label: "Paid"      },
  { value: "pending"   as Category, label: "Pending"   },
  { value: "recurring" as Category, label: "Recurring" },
];

interface PendingPayment { id: string; amount_inr: number; lead_name: string | null }
interface Props {
  initialPayments: PaymentRow[];
  initialHasMore?: boolean;
  orgId:           string;
  orgSlug:         string;
  isDev:           boolean;
  leads:           SimulateLead[];
  groups?:         PaymentActionGroup[];
  pendingPayments: PendingPayment[];
  paymentMode:     PaymentMode;
}

type Group = { key: string; label: string; icon: React.ElementType; color: string; rows: PaymentRow[] };
interface StatsData { collected: number; pending: number; pipeline: number; count: number }

function groupPayments(payments: PaymentRow[], category: Category): Group[] {
  const filter = (s: string[]) => payments.filter((p) => s.includes(p.status));
  const sort   = (arr: PaymentRow[], by: keyof PaymentRow) =>
    [...arr].sort((a, b) => new Date(b[by] as string).getTime() - new Date(a[by] as string).getTime());

  const groups: Group[] = [];
  if (category === "all" || category === "pending") {
    const pending = filter(["pending"]);
    if (pending.length) groups.push({ key: "pending", label: "Pending", icon: Clock, color: "text-amber-400", rows: sort(pending, "created_at") });
  }
  if (category === "all" || category === "paid") {
    const paid = filter(["paid"]);
    if (paid.length) groups.push({ key: "paid", label: "Paid", icon: CheckCircle2, color: "text-[var(--brand)]", rows: sort(paid, "updated_at") });
  }
  if (category === "all") {
    const failed = filter(["failed", "refunded"]);
    if (failed.length) groups.push({ key: "failed", label: "Failed / Refunded", icon: XCircle, color: "text-red-400", rows: sort(failed, "updated_at") });
  }
  return groups;
}

function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function SectionHeader({ group, open, onToggle }: { group: Group; open: boolean; onToggle: () => void }) {
  const Icon = group.icon;
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 py-1.5 text-left select-none group">
      <Icon className={cn("h-4 w-4 shrink-0", group.color)} />
      <span className={cn("text-sm font-semibold", group.color)}>{group.label}</span>
      <span className="ml-1 text-xs text-[var(--text-3)]">({group.rows.length})</span>
      <span className="ml-auto text-[var(--text-3)] group-hover:text-[var(--text-2)] transition-colors">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </span>
    </button>
  );
}

function StatTile({ label, value, color, loading }: { label: string; value: string; color: string; loading: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-1">
      <p className="text-xs text-[var(--text-3)]">{label}</p>
      {loading
        ? <div className="h-7 w-24 rounded-[var(--radius-sm)] bg-[var(--bg-3)] animate-pulse" />
        : <p className={cn("font-mono text-xl font-semibold tabular-nums", color)}>{value}</p>
      }
    </div>
  );
}

export function PaymentsView({ initialPayments, initialHasMore = false, orgId, orgSlug: _slug, isDev, leads, groups = [], pendingPayments, paymentMode }: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  // Initialise state from URL → localStorage → default
  const [category, setCategory] = useState<Category>(() => {
    const u = (searchParams.get("cat") ?? "") as Category;
    return ["paid", "pending", "recurring"].includes(u) ? u : "all";
  });
  const [range, setRange]       = useState<Range>(() => {
    const stored = readStoredFilter(STORAGE_KEY);
    return stored?.range ?? parseRange(searchParams.get("range"));
  });
  const [customFrom, setCustomFrom] = useState<string | null>(() => readStoredFilter(STORAGE_KEY)?.from ?? null);
  const [customTo,   setCustomTo]   = useState<string | null>(() => readStoredFilter(STORAGE_KEY)?.to   ?? null);

  const [payments, setPayments]         = useState<PaymentRow[]>(initialPayments);
  const [hasMore, setHasMore]           = useState(initialHasMore);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [localPending, setLocalPending] = useState<PendingPayment[]>(pendingPayments);
  const [open, setOpen]                 = useState<Record<string, boolean>>({ pending: true, paid: true });
  const [stats, setStats]               = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // Recurring payments
  const [recurring, setRecurring]               = useState<RecurringPaymentRow[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [rTarget, setRTarget] = useState<"lead"|"group">("lead");
  const [rLead,   setRLead]   = useState("");
  const [rGroup,  setRGroup]  = useState("");
  const [rAmount, setRAmount] = useState("");
  const [rFreq,   setRFreq]   = useState<"daily"|"weekly"|"monthly"|"yearly">("monthly");
  const [rName,   setRName]   = useState("");
  const [rDesc,   setRDesc]   = useState("");
  const [rStartAt, setRStartAt] = useState<string>(() => {
    // Default: now + 1 hour, formatted for datetime-local
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [rSaving, setRSaving] = useState(false);

  const loadRecurring = useCallback(async () => {
    setRecurringLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/payments/recurring`);
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
    if (!hasTarget || !rAmount || !rName) return;
    setRSaving(true);
    try {
      // Convert datetime-local to a proper ISO string with offset
      const firstRunAt = rStartAt ? new Date(rStartAt).toISOString() : undefined;
      const body: Record<string, unknown> = {
        amount_inr:           Number(rAmount),
        description:          rDesc || rName,
        template_name:        rName,
        recurrence_frequency: rFreq,
        first_run_at:         firstRunAt,
      };
      if (rTarget === "lead")  body.lead_id  = rLead;
      else                     body.group_id = rGroup;

      const res = await fetch(`/api/orgs/${orgId}/payments/recurring`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const created = (data as { created?: number }).created ?? 1;
      toast({ title: created > 1 ? `${created} recurring payments created` : "Recurring payment created", variant: "success" });
      setShowRecurringForm(false);
      setRLead(""); setRGroup(""); setRAmount(""); setRName(""); setRDesc("");
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
      const p = new URLSearchParams({ range: r, status: cat === "all" ? "all" : cat });
      if (r === "custom" && cf) p.set("from", cf);
      if (r === "custom" && ct) p.set("to", ct);
      const res = await fetch(`/api/orgs/${orgId}/payments/stats?${p}`, { signal: ctrl.signal });
      if (!res.ok) return;
      const json = await res.json();
      setStats({ collected: json.collected, pending: json.pending, pipeline: json.pipeline, count: json.count });
    } catch { /* aborted */ }
    finally { setStatsLoading(false); }
  }, [orgId]);

  // Sync URL params
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
    try {
      const res = await fetch(`/api/orgs/${orgId}/payments?limit=101`);
      if (!res.ok) throw new Error("Failed to refresh payments");
      const json = await res.json();
      const all: PaymentRow[] = json.payments ?? [];
      setHasMore(all.length > 100);
      const rows = all.slice(0, 100);
      setPayments(rows);
      setLocalPending(rows.filter((p) => p.status === "pending").map((p) => ({ id: p.id, amount_inr: p.amount_inr, lead_name: p.lead?.name ?? null })));
    } catch {
      toast({ title: "Could not refresh payments", description: "Check your connection and try again.", variant: "destructive" });
    }
    fetchStats(range, category, customFrom, customTo);
    router.refresh();
  }, [orgId, router, fetchStats, range, category, customFrom, customTo]);

  // Delete removes from LIST but NOT from stats (Refinement 1 rule)
  const handleDelete = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
    setLocalPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || payments.length === 0) return;
    const cursor = payments[payments.length - 1].created_at;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/payments?limit=101&cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error("Failed to load more");
      const json = await res.json();
      const all: PaymentRow[] = json.payments ?? [];
      setHasMore(all.length > 100);
      const nextPage = all.slice(0, 100);
      setPayments((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        return [...prev, ...nextPage.filter((p) => !existingIds.has(p.id))];
      });
    } catch {
      toast({ title: "Could not load more payments", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, payments, hasMore, loadingMore]);

  // Apply the SAME filter to the row list: range + category.
  // This makes the row list and the metric tiles consistent.
  // Note: deleted payments are excluded from the list (deleted_at filter
  // on the server) but still counted in metrics (stats endpoint rule).
  const { from: rangFrom, to: rangTo } = getRangeBounds(range, customFrom, customTo);
  const visiblePayments = payments.filter((p) => {
    if (category === "recurring") return false; // handled separately
    const matchesRange    = isInRange(p.created_at, range, rangFrom, rangTo);
    const matchesCategory = category === "all" || p.status === category;
    return matchesRange && matchesCategory;
  });

  const paymentGroups = category === "recurring" ? [] : groupPayments(visiblePayments, category);

  return (
    <div className="space-y-5">
      {/* ── Dev / actions bar ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <PaymentActionsSheet orgId={orgId} leads={leads} groups={groups} onDone={handleUpdate} paymentMode={paymentMode} />
        <ManualPaymentSheet orgId={orgId} leads={leads} groups={groups as ManualPaymentGroup[]} onDone={handleUpdate} />
        {isDev && (
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
            <span className="text-[11px] text-amber-500/70 font-mono uppercase tracking-wide">dev</span>
            <SimulatePaymentSheet orgId={orgId} leads={leads} pendingPayments={localPending} onDone={handleUpdate} />
          </div>
        )}
      </div>

      {/* ── Sub-category + range filter row ─────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubCategoryTabs options={CATEGORY_TABS} value={category} onChange={handleCategoryChange} />
        <TimeRangeFilter storageKey={STORAGE_KEY} value={range} customFrom={customFrom} customTo={customTo} onChange={handleRangeChange} />
      </div>

      {/* ── Metric tiles ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 max-w-2xl sm:grid-cols-4">
        <StatTile label="Collected"     value={formatInr(stats?.collected ?? 0)} color={(stats?.collected ?? 0) > 0 ? "text-[var(--brand)]" : "text-[var(--text-2)]"} loading={statsLoading} />
        <StatTile label="Pending"       value={formatInr(stats?.pending   ?? 0)} color={(stats?.pending   ?? 0) > 0 ? "text-amber-400"       : "text-[var(--text-2)]"} loading={statsLoading} />
        <StatTile label="Total pipeline" value={formatInr(stats?.pipeline ?? 0)} color="text-[var(--text)]"     loading={statsLoading} />
        <StatTile label="Transactions"  value={String(stats?.count ?? 0)}        color="text-[var(--text-2)]"  loading={statsLoading} />
      </div>

      {/* ── Empty state (non-recurring tabs) ─────────────── */}
      {category !== "recurring" && paymentGroups.length === 0 && (() => {
        const neverHadPayments = payments.length === 0;
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center max-w-2xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-3)]">
              <IndianRupee className="h-7 w-7 text-[var(--text-3)]" />
            </div>
            <div className="space-y-1 max-w-xs">
              {neverHadPayments ? (
                <>
                  <p className="font-display text-base font-semibold text-[var(--text)]">No payments yet</p>
                  <p className="text-sm text-[var(--text-3)] leading-relaxed">
                    Send your first payment request to a lead using the button above.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-base font-semibold text-[var(--text)]">No payments in this range</p>
                  <p className="text-sm text-[var(--text-3)] leading-relaxed">
                    {isDev ? "Use the Simulate button above to create test payments." : "Try a wider time range, or send a payment link to a qualified lead."}
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Recurring tab ────────────────────────────────── */}
      {category === "recurring" && (
        <div className="space-y-4 max-w-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRecurringForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-3 py-1.5 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand)]/15 transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" /> New recurring payment
            </button>
            <button onClick={loadRecurring} disabled={recurringLoading}
              className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
              <RefreshCw className={cn("h-3 w-3", recurringLoading && "animate-spin")} /> Refresh
            </button>
          </div>

          {/* Create recurring form */}
          {showRecurringForm && (
            <form onSubmit={createRecurring} className="rounded-[var(--radius-md)] border border-[var(--brand)]/20 bg-[var(--bg-2)] p-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--text)]">New recurring payment</p>

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

              {/* Lead selector */}
              {rTarget === "lead" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">Lead *</label>
                  <select value={rLead} onChange={(e) => setRLead(e.target.value)} required
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]">
                    <option value="">Select lead…</option>
                    {leads.map((l) => <option key={l.id} value={l.id}>{(l as {name:string|null}).name ?? "Unnamed"} ({l.channel})</option>)}
                  </select>
                </div>
              )}

              {/* Group selector */}
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
                  <label className="text-xs font-medium text-[var(--text-2)]">Amount (₹) *</label>
                  <input type="number" min="1" value={rAmount} onChange={(e) => setRAmount(e.target.value)} required placeholder="15000"
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
                <p className="text-[11px] text-[var(--text-3)]">First payment will be sent at this time. Subsequent payments follow the frequency.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Template name *</label>
                <input value={rName} onChange={(e) => setRName(e.target.value)} required placeholder="Monthly Membership Collection"
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Description / notes</label>
                <input value={rDesc} onChange={(e) => setRDesc(e.target.value)} placeholder="e.g. Monthly coaching fee"
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
            <EmptyState
              icon={<RefreshCw className="h-5 w-5" />}
              title="No recurring payments yet"
              description="Set up a recurring payment template to automatically send payment links to a lead or group on a schedule."
              action={
                <button
                  onClick={() => setShowRecurringForm(true)}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-[#0A0A0C] hover:opacity-90 transition-opacity"
                >
                  <PlusCircle className="h-3.5 w-3.5" /> Create first recurring payment
                </button>
              }
            />
          )}
          {!recurringLoading && recurring.map((r) => (
            <RecurringPaymentCard
              key={r.id}
              payment={r}
              orgId={orgId}
              onUpdate={loadRecurring}
              onDelete={(id) => setRecurring((prev) => prev.filter((p) => p.id !== id))}
            />
          ))}
        </div>
      )}

      {/* ── Grouped lists ───────────────────────────────── */}
      <div className="space-y-6 max-w-2xl">
        {paymentGroups.map((group) => {
          const isOpen = open[group.key] !== false;
          return (
            <div key={group.key} className="space-y-3">
              <SectionHeader group={group} open={isOpen} onToggle={() => setOpen((p) => ({ ...p, [group.key]: !p[group.key] }))} />
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pb-1">
                      {group.rows.map((p) => (
                        <PaymentCard key={p.id} payment={p} onUpdate={handleUpdate} onDelete={handleDelete} isDev={isDev} orgId={orgId} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Load more — only shown when there are visible payments and more exist */}
        {paymentGroups.length > 0 && hasMore && (
          <div className="flex justify-center pt-2">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-4 py-2.5 text-sm text-[var(--text-2)] hover:bg-[var(--bg-3)] disabled:opacity-50 transition-colors"
              aria-label="Load more payments"
            >
              {loadingMore
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>
                : "Load more payments"
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
