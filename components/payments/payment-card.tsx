"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink, User, CheckCircle2,
  Clock, XCircle, AlertTriangle, Copy, Check,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────
export interface PaymentLead {
  id:         string;
  name:       string | null;
  avatar_url: string | null;
  stage:      string;
  channel:    string;
}

export interface PaymentRow {
  id:               string;
  status:           "pending" | "paid" | "failed" | "refunded";
  amount_inr:       number;
  payment_link_url: string | null;
  payment_link_id:  string | null;
  conversation_id:  string | null;
  notes:            string | null;
  created_at:       string;
  updated_at:       string;
  lead:             PaymentLead | null;
}

// ── Status config ────────────────────────────────────────────
const STATUS_CONFIG = {
  paid:     { label: "Paid",     color: "bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20", icon: CheckCircle2 },
  pending:  { label: "Pending",  color: "bg-amber-500/15 text-amber-400 border-amber-500/25",               icon: Clock },
  failed:   { label: "Failed",   color: "bg-red-500/15 text-red-400 border-red-500/25",                     icon: XCircle },
  refunded: { label: "Refunded", color: "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]",     icon: AlertTriangle },
} as const;

function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

interface Props {
  payment:  PaymentRow;
  /** Called after a dev action so the list can refresh. */
  onUpdate?: () => void;
  /** Shows dev action buttons when true. */
  isDev?:    boolean;
  orgId?:    string;
}

export function PaymentCard({ payment, onUpdate, isDev, orgId }: Props) {
  const [acting,  setActing]  = useState<"capture" | "unpaid" | "markpaid" | null>(null);
  const [copied,  setCopied]  = useState(false);

  async function copyLink() {
    if (!payment.payment_link_url) return;
    await navigator.clipboard.writeText(payment.payment_link_url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function markPaid() {
    if (!orgId) return;
    setActing("markpaid");
    try {
      const res = await fetch(`/api/orgs/${orgId}/payments/mark-paid`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ payment_id: payment.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "Payment marked as received", description: "Receipt sent to lead's inbox.", variant: "success" });
      onUpdate?.();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  const cfg  = STATUS_CONFIG[payment.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const lead = payment.lead;
  const displayName = lead?.name ?? "Unknown lead";

  const initials = displayName
    .split(" ").slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");

  async function devAction(action: "capture" | "unpaid") {
    if (!orgId || acting) return;
    setActing(action);
    try {
      await fetch(`/api/orgs/${orgId}/payments/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, paymentId: payment.id }),
      });
      onUpdate?.();
    } finally {
      setActing(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--bg-2)] p-4 space-y-3 transition-colors",
        payment.status === "paid"    ? "border-[var(--brand)]/20" :
        payment.status === "failed"  ? "border-red-500/20"        : "border-[var(--border)]"
      )}
    >
      {/* ── Row 1: lead + amount + status ── */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          payment.status === "paid"
            ? "bg-[var(--brand)]/15 text-[var(--brand)]"
            : "bg-[var(--bg-3)] text-[var(--text-2)]"
        )}>
          {lead?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lead.avatar_url} alt={displayName} className="h-full w-full rounded-full object-cover" />
          ) : (
            initials || <User className="h-4 w-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--text)] truncate">{displayName}</span>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              cfg.color
            )}>
              <Icon className="h-3 w-3" />
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-[var(--text-3)] mt-0.5">{formatDate(payment.created_at)}</p>
        </div>

        {/* Amount — monospaced, prominent */}
        <div className={cn(
          "shrink-0 font-mono text-base font-semibold tabular-nums",
          payment.status === "paid" ? "text-[var(--brand)]" : "text-[var(--text)]"
        )}>
          {formatInr(payment.amount_inr)}
        </div>
      </div>

      {/* ── Notes (e.g. dunning flagged) ── */}
      {payment.notes && (
        <p className="text-xs text-amber-400 bg-amber-500/10 rounded-[var(--radius-sm)] px-2.5 py-1.5">
          ⚑ {payment.notes}
        </p>
      )}

      {/* ── Actions row ── */}
      <div className="flex items-center gap-2">
        {payment.payment_link_url && payment.status === "pending" && (
          <div className="flex items-center gap-2 flex-wrap">
            <a href={payment.payment_link_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline">
              <ExternalLink className="h-3 w-3" /> Open link
            </a>
            <button onClick={copyLink}
              className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
              {copied ? <Check className="h-3 w-3 text-[var(--brand)]" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {orgId && (
              <button onClick={markPaid} disabled={acting === "markpaid"}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--brand)] transition-colors disabled:opacity-50">
                <CheckCircle2 className="h-3 w-3" />
                {acting === "markpaid" ? "Saving…" : "Mark as paid"}
              </button>
            )}
          </div>
        )}

        {/* Dev-only inline actions */}
        {isDev && payment.status === "pending" && (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => devAction("capture")}
              disabled={!!acting}
              className="rounded-[var(--radius-sm)] bg-[var(--brand)]/10 border border-[var(--brand)]/20 px-2 py-0.5 text-[11px] font-medium text-[var(--brand)] hover:bg-[var(--brand)]/20 disabled:opacity-50 transition-colors"
            >
              {acting === "capture" ? "…" : "✓ Mark paid"}
            </button>
            <button
              type="button"
              onClick={() => devAction("unpaid")}
              disabled={!!acting}
              className="rounded-[var(--radius-sm)] bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
            >
              {acting === "unpaid" ? "…" : "⚑ Start dunning"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
