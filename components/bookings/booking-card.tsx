"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar, Clock, Video, User, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, RotateCcw, Loader2,
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

interface Props {
  booking:  BookingRow;
  orgSlug:  string;
  orgId:    string;
  onUpdate: () => void;
}

export function BookingCard({ booking, orgSlug, orgId, onUpdate }: Props) {
  const [marking, setMarking] = useState(false);

  const { date, time } = formatDateTime(booking.starts_at);
  const cfg = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const lead = booking.lead;
  const displayName = booking.attendee_name ?? lead?.name ?? "Unknown attendee";

  // Initials for avatar fallback
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  async function markNoShow() {
    if (marking || booking.status !== "confirmed") return;
    setMarking(true);
    try {
      await fetch(`/api/orgs/${orgId}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, action: "no_show" }),
      });
      onUpdate();
    } finally {
      setMarking(false);
    }
  }

  const recoveryLabel =
    booking.status === "no_show" && booking.recovery_attempt > 0
      ? `Re-book offer sent (${booking.recovery_attempt}/2)`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--bg-2)] p-4 space-y-3 transition-colors",
        booking.status === "no_show"
          ? "border-red-500/20"
          : booking.status === "confirmed"
          ? "border-emerald-500/20"
          : "border-[var(--border)]"
      )}
    >
      {/* ── Row 1: avatar + name + status ── */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            booking.status === "confirmed"
              ? "bg-emerald-500/20 text-emerald-400"
              : booking.status === "no_show"
              ? "bg-red-500/20 text-red-400"
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
            {/* Status pill */}
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
        {booking.meeting_url && (
          <a
            href={booking.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[var(--brand)] hover:underline"
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
      {booking.status === "confirmed" && (
        <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={markNoShow}
            disabled={marking}
            className="h-7 text-xs gap-1.5 text-[var(--text-3)] hover:text-red-400 hover:bg-red-500/10"
          >
            {marking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Mark no-show
          </Button>
        </div>
      )}
    </motion.div>
  );
}
