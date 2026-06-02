"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { IndianRupee, CheckCircle2, Clock, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { PaymentCard, type PaymentRow } from "./payment-card";
import { SimulatePaymentSheet, type SimulateLead } from "./simulate-payment-sheet";
import { PaymentActionsSheet } from "./payment-actions-sheet";
import { TimeRangeFilter, readStoredFilter } from "@/components/filters/time-range-filter";
import { SubCategoryTabs } from "@/components/filters/sub-category-tabs";
import { parseRange, getRangeBounds, isInRange, type Range } from "@/lib/range";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "effora-payments-filter";

type Category = "all" | "paid" | "pending";

const CATEGORY_TABS = [
  { value: "all"     as Category, label: "All"     },
  { value: "paid"    as Category, label: "Paid"    },
  { value: "pending" as Category, label: "Pending" },
];

interface PendingPayment { id: string; amount_inr: number; lead_name: string | null }
interface Props {
  initialPayments: PaymentRow[];
  orgId:           string;
  orgSlug:         string;
  isDev:           boolean;
  leads:           SimulateLead[];
  pendingPayments: PendingPayment[];
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

export function PaymentsView({ initialPayments, orgId, orgSlug: _slug, isDev, leads, pendingPayments }: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  // Initialise state from URL → localStorage → default
  const [category, setCategory] = useState<Category>(() => {
    const u = (searchParams.get("cat") ?? "") as Category;
    return ["paid", "pending"].includes(u) ? u : "all";
  });
  const [range, setRange]       = useState<Range>(() => {
    const stored = readStoredFilter(STORAGE_KEY);
    return stored?.range ?? parseRange(searchParams.get("range"));
  });
  const [customFrom, setCustomFrom] = useState<string | null>(() => readStoredFilter(STORAGE_KEY)?.from ?? null);
  const [customTo,   setCustomTo]   = useState<string | null>(() => readStoredFilter(STORAGE_KEY)?.to   ?? null);

  const [payments, setPayments]         = useState<PaymentRow[]>(initialPayments);
  const [localPending, setLocalPending] = useState<PendingPayment[]>(pendingPayments);
  const [open, setOpen]                 = useState<Record<string, boolean>>({ pending: true, paid: true });
  const [stats, setStats]               = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

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
    const res = await fetch(`/api/orgs/${orgId}/payments`);
    if (res.ok) {
      const json = await res.json();
      const rows: PaymentRow[] = json.payments ?? [];
      setPayments(rows);
      setLocalPending(rows.filter((p) => p.status === "pending").map((p) => ({ id: p.id, amount_inr: p.amount_inr, lead_name: p.lead?.name ?? null })));
    }
    fetchStats(range, category, customFrom, customTo);
    router.refresh();
  }, [orgId, router, fetchStats, range, category, customFrom, customTo]);

  // Delete removes from LIST but NOT from stats (Refinement 1 rule)
  const handleDelete = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
    setLocalPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Apply the SAME filter to the row list: range + category.
  // This makes the row list and the metric tiles consistent.
  // Note: deleted payments are excluded from the list (deleted_at filter
  // on the server) but still counted in metrics (stats endpoint rule).
  const { from: rangFrom, to: rangTo } = getRangeBounds(range, customFrom, customTo);
  const visiblePayments = payments.filter((p) => {
    const matchesRange    = isInRange(p.created_at, range, rangFrom, rangTo);
    const matchesCategory = category === "all" || p.status === category;
    return matchesRange && matchesCategory;
  });

  const groups = groupPayments(visiblePayments, category);

  return (
    <div className="space-y-5">
      {/* ── Dev / actions bar ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <PaymentActionsSheet orgId={orgId} leads={leads} onDone={handleUpdate} />
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

      {/* ── Empty state ──────────────────────────────────── */}
      {groups.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center max-w-2xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-3)]">
            <IndianRupee className="h-7 w-7 text-[var(--text-3)]" />
          </div>
          <div className="space-y-1 max-w-xs">
            <p className="font-display text-base font-semibold text-[var(--text)]">No payments in this range</p>
            <p className="text-sm text-[var(--text-3)] leading-relaxed">
              {isDev ? "Use the Simulate button above to create test payments." : "Try a wider time range, or send a payment link to a qualified lead."}
            </p>
          </div>
        </div>
      )}

      {/* ── Grouped lists ───────────────────────────────── */}
      <div className="space-y-6 max-w-2xl">
        {groups.map((group) => {
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
      </div>
    </div>
  );
}
