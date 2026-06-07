"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar, Clock, Video, User, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Trash2, Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────
export interface BookingLead {
  id:         string;
  name:       string | null;
  avatar_url: string | null;
  stage:      string;
  channel:    string;
}

export interface BookingRow {
  id:               string;
  status:           "pending" | "confirmed" | "no_show" | "completed" | "cancelled";
  starts_at:        string | null;
  ends_at:          string | null;
  meeting_url:      string | null;
  attendee_name:    string | null;
  attendee_email:   string | null;
  conversation_id:  string | null;
  recovery_attempt: number;
  recovery_sent_at: string | null;
  created_at:       string;
  lead:             BookingLead | null;
}

// ── Helpers ──────────────────────────────────────────────────
function formatDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "—", time: "" };
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Kolkata" }),
      time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }),
    };
  } catch {
    return { date: iso, time: "" };
  }
}

const STATUS_CONFIG = {
  confirmed:  { label: "Confirmed",  color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", icon: CheckCircle2 },
  completed:  { label: "Completed",  color: "bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20", icon: CheckCircle2 },
  no_show:    { label: "No Show",    color: "bg-red-500/15 text-red-400 border-red-500/25",             icon: AlertTriangle },
  cancelled:  { label: "Cancelled",  color: "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]", icon: XCircle },
  pending:    { label: "Pending",    color: "bg-amber-500/15 text-amber-400 border-amber-500/25",       icon: Clock },
} as const;

// ── Inline confirmation modal ────────────────────────────────
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
  booking:  BookingRow;
  orgSlug:  string;
  orgId:    string;
  onUpdate: () => void;
  onDelete: (id: string) => void;
}

export function BookingCard({ booking, orgSlug: _orgSlug, orgId, onUpdate, onDelete }: Props) {
  const [marking,   setMarking]   = useState<"completed" | "no_show" | null>(null);
  const [deleting,  setDeleting]  = useState<"soft" | "hard" | null>(null);
  const [hardConfirm, setHardConfirm] = useState(false);

  const { date, time } = formatDateTime(booking.starts_at);
  const cfg        = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const lead       = booking.lead;
  const displayName = booking.attendee_name ?? lead?.name ?? "Unknown attendee";

  const initials = displayName
    .split(" ").slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");

  const isBusy = !!marking || !!deleting;

  // ── Actions ──────────────────────────────────────────────
  async function markCompleted() {
    if (isBusy) return;
    setMarking("completed");
    try {
      await fetch(`/api/orgs/${orgId}/bookings`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ bookingId: booking.id, action: "completed" }),
      });
      onUpdate();
    } finally {
      setMarking(null);
    }
  }

  async function markNoShow() {
    if (isBusy) return;
    setMarking("no_show");
    try {
      await fetch(`/api/orgs/${orgId}/bookings`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ bookingId: booking.id, action: "no_show" }),
      });
      onUpdate();
    } finally {
      setMarking(null);
    }
  }

  /** Soft delete — hides from list, stays in reports + lead history. */
  async function archiveBooking() {
    if (isBusy) return;
    setDeleting("soft");
    try {
      await fetch(`/api/orgs/${orgId}/bookings/${booking.id}`, { method: "DELETE" });
      onDelete(booking.id);
    } finally {
      setDeleting(null);
    }
  }

  /** Hard delete — permanently removes the booking row. */
  async function hardDeleteBooking() {
    if (isBusy) return;
    setDeleting("hard");
    setHardConfirm(false);
    try {
      await fetch(`/api/orgs/${orgId}/bookings/${booking.id}?mode=hard`, { method: "DELETE" });
      onDelete(booking.id);
    } finally {
      setDeleting(null);
    }
  }

  const recoveryLabel =
    booking.status === "no_show" && booking.recovery_attempt > 0
      ? `Re-book offer sent (${booking.recovery_attempt}/2)`
      : null;

  return (
    <>
      {hardConfirm && (
        <ConfirmModal
          title="Delete booking permanently?"
          body={`This will remove:\n• The booking record\n• This booking from lead history\n• Any linked reminders\n\nThis action cannot be undone.`}
          confirmLabel="Delete permanently"
          onConfirm={hardDeleteBooking}
          onCancel={() => setHardConfirm(false)}
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "rounded-[var(--radius-md)] border bg-[var(--bg-2)] p-4 space-y-3 transition-colors",
          booking.status === "no_show"
            ? "border-red-500/20"
            : booking.status === "confirmed"
            ? "border-emerald-500/20"
            : booking.status === "completed"
            ? "border-[var(--brand)]/15"
            : "border-[var(--border)]"
        )}
      >
        {/* ── Row 1: avatar + name + status ── */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              booking.status === "confirmed"
                ? "bg-emerald-500/20 text-emerald-400"
                : booking.status === "no_show"
                ? "bg-red-500/20 text-red-400"
                : booking.status === "completed"
                ? "bg-[var(--brand)]/15 text-[var(--brand)]"
                : "bg-[var(--bg-3)] text-[var(--text-2)]"
            )}
          >
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
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </span>
            </div>
            {booking.attendee_email && (
              <p className="text-xs text-[var(--text-3)] truncate mt-0.5">{booking.attendee_email}</p>
            )}
          </div>
        </div>

        {/* ── Row 2: time + meeting link ── */}
        <div className="flex items-center gap-4 text-xs text-[var(--text-2)]">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-[var(--text-3)]" />
            {date}
          </span>
          {time && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[var(--text-3)]" />
              {time}
            </span>
          )}
          {booking.meeting_url && booking.status === "confirmed" && (
            <a
              href={booking.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[var(--brand)] hover:underline font-medium"
            >
              <Video className="h-3.5 w-3.5" />
              Join call
            </a>
          )}
        </div>

        {/* ── Recovery state ── */}
        {recoveryLabel && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
            <RefreshCw className="h-3 w-3 animate-spin-slow" />
            {recoveryLabel}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border)]">

          {/* UPCOMING: Meeting Done + Mark No Show */}
          {booking.status === "confirmed" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={markCompleted}
                disabled={isBusy}
                className="h-7 text-xs gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              >
                {marking === "completed"
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <CheckCircle2 className="h-3 w-3" />
                }
                Meeting done
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={markNoShow}
                disabled={isBusy}
                className="h-7 text-xs gap-1.5 text-[var(--text-3)] hover:text-red-400 hover:bg-red-500/10"
              >
                {marking === "no_show"
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <AlertTriangle className="h-3 w-3" />
                }
                Mark no-show
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={archiveBooking}
                disabled={isBusy}
                className="ml-auto h-7 text-xs gap-1.5 text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--bg-3)]"
              >
                {deleting === "soft"
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Archive className="h-3 w-3" />
                }
                {deleting === "soft" ? "Archiving…" : "Delete from list"}
              </Button>
            </>
          )}

          {/* COMPLETED / NO SHOW / CANCELLED: Delete From List + Delete Booking */}
          {(booking.status === "completed" || booking.status === "no_show" || booking.status === "cancelled") && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={archiveBooking}
                disabled={isBusy}
                className="h-7 text-xs gap-1.5 text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--bg-3)]"
              >
                {deleting === "soft"
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Archive className="h-3 w-3" />
                }
                {deleting === "soft" ? "Archiving…" : "Delete from list"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHardConfirm(true)}
                disabled={isBusy}
                className="h-7 text-xs gap-1.5 text-[var(--text-3)] hover:text-red-400 hover:bg-red-500/10"
              >
                {deleting === "hard"
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Trash2 className="h-3 w-3" />
                }
                {deleting === "hard" ? "Deleting…" : "Delete booking"}
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
