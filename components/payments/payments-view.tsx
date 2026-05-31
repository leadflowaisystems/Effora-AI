"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  IndianRupee, CheckCircle2, Clock, XCircle, ChevronDown, ChevronRight,
} from "lucide-react";
import { PaymentCard, type PaymentRow } from "./payment-card";
import { SimulatePaymentSheet, type SimulateLead } from "./simulate-payment-sheet";
import { PaymentActionsSheet } from "./payment-actions-sheet";
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

function groupPayments(payments: PaymentRow[]): Group[] {
  const paid     = payments.filter((p) => p.status === "paid");
  const pending  = payments.filter((p) => p.status === "pending");
  const failed   = payments.filter((p) => p.status === "failed" || p.status === "refunded");

  const groups: Group[] = [];

  if (pending.length) {
    groups.push({
      key:   "pending",
      label: "Pending",
      icon:  Clock,
      color: "text-amber-400",
      rows:  pending.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    });
  }
  if (paid.length) {
    groups.push({
      key:   "paid",
      label: "Paid",
      icon:  CheckCircle2,
      color: "text-[var(--brand)]",
      rows:  paid.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    });
  }
  if (failed.length) {
    groups.push({
      key:   "failed",
      label: "Failed / Refunded",
      icon:  XCircle,
      color: "text-red-400",
      rows:  failed.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    });
  }

  return groups;
}

function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(n);
}

function SectionHeader({
  group, open, onToggle,
}: { group: Group; open: boolean; onToggle: () => void }) {
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

export function PaymentsView({
  initialPayments, orgId, orgSlug: _orgSlug, isDev, leads, pendingPayments,
}: Props) {
  const router  = useRouter();
  const [payments, setPayments] = useState<PaymentRow[]>(initialPayments);
  const [localPending, setLocalPending] = useState<PendingPayment[]>(pendingPayments);
  const [open, setOpen] = useState<Record<string, boolean>>({ pending: true, paid: true });

  const handleUpdate = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/payments`);
    if (res.ok) {
      const json = await res.json();
      const rows: PaymentRow[] = json.payments ?? [];
      setPayments(rows);
      setLocalPending(
        rows
          .filter((p) => p.status === "pending")
          .map((p) => ({
            id:         p.id,
            amount_inr: p.amount_inr,
            lead_name:  p.lead?.name ?? null,
          }))
      );
    }
    router.refresh();
  }, [orgId, router]);

  const groups = groupPayments(payments);

  // ── Revenue totals ──────────────────────────────────────────
  const totalPaid    = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount_inr, 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount_inr, 0);

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

  return (
    <div className="space-y-6">
      {devBar}

      {/* ── Revenue summary ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 max-w-2xl sm:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-1">
          <p className="text-xs text-[var(--text-3)]">Collected</p>
          <p className={cn(
            "font-mono text-xl font-semibold tabular-nums",
            totalPaid > 0 ? "text-[var(--brand)]" : "text-[var(--text-2)]"
          )}>
            {formatInr(totalPaid)}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-1">
          <p className="text-xs text-[var(--text-3)]">Pending</p>
          <p className={cn(
            "font-mono text-xl font-semibold tabular-nums",
            totalPending > 0 ? "text-amber-400" : "text-[var(--text-2)]"
          )}>
            {formatInr(totalPending)}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-1 col-span-2 sm:col-span-1">
          <p className="text-xs text-[var(--text-3)]">Total pipeline</p>
          <p className="font-mono text-xl font-semibold tabular-nums text-[var(--text)]">
            {formatInr(totalPaid + totalPending)}
          </p>
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
