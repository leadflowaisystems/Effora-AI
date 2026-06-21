"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink, User, CheckCircle2,
  Clock, XCircle, AlertTriangle, Copy, Check, Trash2, Loader2, Archive, QrCode, X,
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
  link_method:      string | null;
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

// ── Method badge ─────────────────────────────────────────────
const METHOD_BADGE: Record<string, { label: string; cls: string }> = {
  razorpay: { label: "Razorpay",       cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  upi:      { label: "UPI",            cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  custom:   { label: "Custom link",    cls: "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]" },
  manual:   { label: "Manual",         cls: "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]" },
};

function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const cfg = METHOD_BADGE[method] ?? { label: method, cls: "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

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

// ── UPI QR modal ─────────────────────────────────────────────
function UpiQrModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: "#FFFFFF", light: "#0A0A0C" } })
        .then((d) => { if (!cancelled) setDataUrl(d); })
        .catch(() => null);
    });
    return () => { cancelled = true; };
  }, [url]);

  // Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="UPI QR code"
    >
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative z-10 w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--text)]">Scan to pay via UPI</p>
          <button onClick={onClose} aria-label="Close QR code" className="p-1 -mr-1 text-[var(--text-3)] hover:text-[var(--text)] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center justify-center rounded-[var(--radius)] bg-[#0A0A0C] p-3">
          {dataUrl
            ? <img src={dataUrl} alt="UPI QR code" className="h-48 w-48" />
            : <div className="h-48 w-48 animate-pulse rounded-[var(--radius-sm)] bg-[var(--bg-3)]" />
          }
        </div>
        <p className="text-xs text-[var(--text-3)] text-center leading-relaxed">
          Open any UPI app — PhonePe, GPay, Paytm — and scan this code.
        </p>
      </div>
    </div>
  );
}

// ── Inline confirmation modal ─────────────────────────────────
function ConfirmModal({
  title, body, confirmLabel, onConfirm, onCancel,
}: {
  title:        string;
  body:         string;
  confirmLabel: string;
  onConfirm:    () => void;
  onCancel:     () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <p className="font-display text-sm font-semibold text-[var(--text)]">{title}</p>
          <p className="text-xs text-[var(--text-3)] leading-relaxed whitespace-pre-line">{body}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-[var(--radius-sm)] bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  payment:  PaymentRow;
  onUpdate?: () => void;
  onDelete?: (id: string) => void;
  isDev?:    boolean;
  orgId?:    string;
}

export function PaymentCard({ payment, onUpdate, onDelete, isDev, orgId }: Props) {
  const [acting,      setActing]      = useState<"capture" | "unpaid" | "markpaid" | null>(null);
  const [copied,      setCopied]      = useState(false);
  const [deleting,    setDeleting]    = useState<"soft" | "hard" | null>(null);
  const [hardConfirm, setHardConfirm] = useState(false);
  const [showQr,      setShowQr]      = useState(false);

  const isBusy   = !!acting || !!deleting;
  const isUpiUrl = payment.payment_link_url?.startsWith("upi://") ?? false;

  async function archivePayment() {
    if (!orgId || isBusy) return;
    setDeleting("soft");
    try {
      await fetch(`/api/orgs/${orgId}/payments/${payment.id}`, { method: "DELETE" });
      onDelete?.(payment.id);
    } finally {
      setDeleting(null);
    }
  }

  async function hardDeletePayment() {
    if (!orgId || isBusy) return;
    setDeleting("hard");
    setHardConfirm(false);
    try {
      await fetch(`/api/orgs/${orgId}/payments/${payment.id}?mode=hard`, { method: "DELETE" });
      onDelete?.(payment.id);
    } finally {
      setDeleting(null);
    }
  }

  async function copyLink() {
    if (!payment.payment_link_url) return;
    await navigator.clipboard.writeText(payment.payment_link_url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function markPaid() {
    if (!orgId || isBusy) return;
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

  // Strip the "method: " prefix from notes if present — it's internal metadata
  const displayNotes = (() => {
    if (!payment.notes) return null;
    const stripped = payment.notes.replace(/^(razorpay|upi|custom|manual):\s*/i, "").trim();
    return stripped || null;
  })();

  async function devAction(action: "capture" | "unpaid") {
    if (!orgId || isBusy) return;
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
    <>
      {hardConfirm && (
        <ConfirmModal
          title="Delete payment permanently?"
          body={`This will remove:\n• The payment record\n• Payment history references\n• Revenue from analytics\n\nThis action cannot be undone.`}
          confirmLabel="Delete permanently"
          onConfirm={hardDeletePayment}
          onCancel={() => setHardConfirm(false)}
        />
      )}

      {showQr && payment.payment_link_url && (
        <UpiQrModal url={payment.payment_link_url} onClose={() => setShowQr(false)} />
      )}

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
              <MethodBadge method={payment.link_method} />
            </div>
            <p className="text-xs text-[var(--text-3)] mt-0.5">{formatDate(payment.created_at)}</p>
          </div>

          {/* Amount */}
          <div className={cn(
            "shrink-0 font-mono text-base font-semibold tabular-nums",
            payment.status === "paid" ? "text-[var(--brand)]" : "text-[var(--text)]"
          )}>
            {formatInr(payment.amount_inr)}
          </div>
        </div>

        {/* ── Description (stripped notes) ── */}
        {displayNotes && (
          <p className="text-xs text-[var(--text-3)] px-0.5">{displayNotes}</p>
        )}

        {/* ── Actions row ── */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border)]">

          {/* PENDING: link actions + Mark Paid */}
          {payment.status === "pending" && (
            <div className="flex items-center gap-2 flex-wrap">
              {payment.payment_link_url && (
                <>
                  {/* UPI — show QR on desktop, deep-link on mobile */}
                  {isUpiUrl ? (
                    <button
                      onClick={() => setShowQr(true)}
                      className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      <QrCode className="h-3 w-3" /> Show QR
                    </button>
                  ) : (
                    <a href={payment.payment_link_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline">
                      <ExternalLink className="h-3 w-3" /> Open link
                    </a>
                  )}
                  <button onClick={copyLink}
                    className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
                    {copied ? <Check className="h-3 w-3 text-[var(--brand)]" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </>
              )}
              {orgId && (
                <button onClick={markPaid} disabled={isBusy}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--brand)] transition-colors disabled:opacity-50">
                  {acting === "markpaid"
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <CheckCircle2 className="h-3 w-3" />
                  }
                  {acting === "markpaid" ? "Saving…" : "Mark as paid"}
                </button>
              )}
            </div>
          )}

          {/* Paid: copy link so coach can reshare if needed */}
          {payment.status === "paid" && payment.payment_link_url && !isUpiUrl && (
            <a href={payment.payment_link_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
              <ExternalLink className="h-3 w-3" /> View receipt
            </a>
          )}

          {/* Archive (soft) + Delete permanently (hard) */}
          {orgId && (
            <div className="ml-auto flex items-center">
              <button
                type="button"
                onClick={archivePayment}
                disabled={isBusy}
                aria-label="Archive payment"
                className="inline-flex items-center gap-1 px-2 py-2 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors disabled:opacity-50 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
              >
                {deleting === "soft" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Archive className="h-3 w-3" aria-hidden="true" />}
                <span className="hidden sm:inline">{deleting === "soft" ? "Archiving…" : "Archive"}</span>
              </button>
              <button
                type="button"
                onClick={() => setHardConfirm(true)}
                disabled={isBusy}
                aria-label="Delete payment permanently"
                className="inline-flex items-center gap-1 px-2 py-2 text-xs text-[var(--text-3)] hover:text-red-400 transition-colors disabled:opacity-50 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                {deleting === "hard" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3 w-3" aria-hidden="true" />}
                <span className="hidden sm:inline">{deleting === "hard" ? "Deleting…" : "Delete"}</span>
              </button>
            </div>
          )}

          {/* Dev-only inline actions */}
          {isDev && payment.status === "pending" && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => devAction("capture")}
                disabled={isBusy}
                className="rounded-[var(--radius-sm)] bg-[var(--brand)]/10 border border-[var(--brand)]/20 px-2 py-0.5 text-[11px] font-medium text-[var(--brand)] hover:bg-[var(--brand)]/20 disabled:opacity-50 transition-colors"
              >
                {acting === "capture" ? "…" : "✓ Mark paid"}
              </button>
              <button
                type="button"
                onClick={() => devAction("unpaid")}
                disabled={isBusy}
                className="rounded-[var(--radius-sm)] bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
              >
                {acting === "unpaid" ? "…" : "⚑ Start dunning"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
