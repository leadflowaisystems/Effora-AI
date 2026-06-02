"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  IndianRupee, CheckCircle2, Clock, XCircle, ChevronDown, ChevronRight,
} from "lucide-react";
import { PaymentCard, type PaymentRow } from "./payment-card";
import { SimulatePaymentSheet, type SimulateLead } from "./simulate-payment-sheet";
import { PaymentActionsSheet } from "./payment-actions-sheet";
import { RangePicker, readStoredRange } from "@/components/ui/range-picker";
import { parseRange, type Range } from "@/lib/range";
import { cn } from "@/lib/utils";

interface PendingPayment {
  id:         string;
  amount_inr: number;
  lead_name:  string | null;
}

interface Props {
  initialPayments: PaymentRow[];
  orgId:           string;
  orgSlug:         string;
  isDev:           boolean;
  leads:           SimulateLead[];
  pendingPayments: PendingPayment[];
}

type Group = {
  key:   string;
  label: string;
  icon:  React.ElementType;
  color: string;
  rows:  PaymentRow[];
};

interface StatsData {
  collected: number;
  pending:   number;
  pipeline:  number;
}

function groupPayments(payments: PaymentRow[]): Group[] {
  const paid    = payments.filter((p) => p.status === "paid");
  const pending = payments.filter((p) => p.status === "pending");
  const failed  = payments.filter((p) => p.status === "failed" || p.status === "refunded");

  const groups: Group[] = [];
  if (pending.length) groups.push({
    key: "pending", label: "Pending", icon: Clock, color: "text-amber-400",
    rows: pending.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  });
  if (paid.length) groups.push({
    key: "paid", label: "Paid", icon: CheckCircle2, color: "text-[var(--brand)]",
    rows: paid.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
  });
  if (failed.length) groups.push({
    key: "failed", label: "Failed / Refunded", icon: XCircle, color: "text-red-400",
    rows: failed.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
  });
  return groups;
}

function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(n);
}

function SectionHeader({ group, open, onToggle }: {
  group: Group; open: boolean; onToggle: () => void;
}) {
  const Icon = group.icon;
  return (
    <button type="button" onClick={onToggle}
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

// Shimmer tile for loading state
function StatTile({ label, value, color, loading }: {
  label: string; value: string; color: string; loading: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-1">
      <p className="text-xs text-[var(--text-3)]">{label}</p>
      {loading ? (
        <div className="h-7 w-24 rounded-[var(--radius-sm)] bg-[var(--bg-3)] animate-pulse" />
      ) : (
        <p className={cn("font-mono text-xl font-semibold tabular-nums", color)}>{value}</p>
      )}
    </div>
  );
}

export function PaymentsView({
  initialPayments, orgId, orgSlug: _orgSlug, isDev, leads, pendingPayments,
}: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  // Initialise range from URL → then localStorage → then default "month"
  const [range, setRangeState] = useState<Range>(() => {
    const fromUrl = parseRange(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("range") : null);
    if (fromUrl !== "month" || typeof window === "undefined") return fromUrl;
    return readStoredRange() ?? "month";
  });

  const [payments, setPayments]         = useState<PaymentRow[]>(initialPayments);
  const [localPending, setLocalPending] = useState<PendingPayment[]>(pendingPayments);
  const [open, setOpen]                 = useState<Record<string, boolean>>({ pending: true, paid: true });

  // Stats come from a dedicated endpoint that INCLUDES soft-deleted payments
  const [stats, setStats]               = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async (r: Range) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/payments/stats?range=${r}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const json = await res.json();
      setStats({ collected: json.collected, pending: json.pending, pipeline: json.pipeline });
    } catch {
      // Aborted or network error — ignore
    } finally {
      setStatsLoading(false);
    }
  }, [orgId]);

  // Fetch stats on mount + range change; also sync URL
  const setRange = useCallback((r: Range) => {
    setRangeState(r);
    fetchStats(r);
    // Update URL param without full navigation
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", r);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [fetchStats, searchParams, pathname, router]);

  useEffect(() => { fetchStats(range); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdate = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/payments`);
    if (res.ok) {
      const json = await res.json();
      const rows: PaymentRow[] = json.payments ?? [];
      setPayments(rows);
      setLocalPending(
        rows.filter((p) => p.status === "pending").map((p) => ({
          id: p.id, amount_inr: p.amount_inr, lead_name: p.lead?.name ?? null,
        }))
      );
    }
    // Refresh stats too (a new payment might have been created)
    fetchStats(range);
    router.refresh();
  }, [orgId, router, fetchStats, range]);

  // Deleting a payment removes it from the LIST but does NOT change stats
  // (deleted payments still count in totals — Refinement 1 rule)
  const handleDelete = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
    setLocalPending((prev) => prev.filter((p) => p.id !== id));
    // Intentionally NOT calling fetchStats — deleted payments stay in totals
  }, []);

  const groups = groupPayments(payments);

  const devBar = (
    <div className="flex flex-wrap items-center gap-2">
      <PaymentActionsSheet orgId={orgId} leads={leads} onDone={handleUpdate} />
      {isDev && (
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
          <span className="text-[11px] text-amber-500/70 font-mono uppercase tracking-wide">dev</span>
          <SimulatePaymentSheet orgId={orgId} leads={leads} pendingPayments={localPending} onDone={handleUpdate} />
        </div>
      )}
    </div>
  );

  const collected = stats?.collected ?? 0;
  const pending   = stats?.pending   ?? 0;
  const pipeline  = stats?.pipeline  ?? 0;

  return (
    <div className="space-y-6">
      {devBar}

      {/* ── Revenue summary + RangePicker ───────────────────── */}
      <div className="space-y-3 max-w-2xl">
        {/* Header row: label + range picker */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-[var(--text-3)] uppercase tracking-wide">Revenue</p>
          <RangePicker value={range} onChange={setRange} />
        </div>

        {/* Metric tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            label="Collected"
            value={formatInr(collected)}
            color={collected > 0 ? "text-[var(--brand)]" : "text-[var(--text-2)]"}
            loading={statsLoading}
          />
          <StatTile
            label="Pending"
            value={formatInr(pending)}
            color={pending > 0 ? "text-amber-400" : "text-[var(--text-2)]"}
            loading={statsLoading}
          />
          <div className="col-span-2 sm:col-span-1">
            <StatTile
              label="Total pipeline"
              value={formatInr(pipeline)}
              color="text-[var(--text)]"
              loading={statsLoading}
            />
          </div>
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────── */}
      {groups.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center max-w-2xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-3)]">
            <IndianRupee className="h-7 w-7 text-[var(--text-3)]" />
          </div>
          <div className="space-y-1 max-w-xs">
            <p className="font-display text-base font-semibold text-[var(--text)]">No payments yet</p>
            <p className="text-sm text-[var(--text-3)] leading-relaxed">
              {isDev
                ? "Use the Simulate button above to create a test payment and watch the dunning flow."
                : "Payment links appear here after you send one to a qualified lead."}
            </p>
          </div>
        </div>
      )}

      {/* ── Grouped lists ───────────────────────────────────── */}
      <div className="space-y-6 max-w-2xl">
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
                      {group.rows.map((p) => (
                        <PaymentCard
                          key={p.id}
                          payment={p}
                          onUpdate={handleUpdate}
                          onDelete={handleDelete}
                          isDev={isDev}
                          orgId={orgId}
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
    </div>
  );
}
