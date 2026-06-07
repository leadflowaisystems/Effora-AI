"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, User, Pause, Play, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface RecurringBookingRow {
  id:                   string;
  booking_type:         "recurring";
  recurrence_frequency: "daily" | "weekly" | "monthly" | "yearly";
  next_run_at:          string | null;
  last_run_at:          string | null;
  template_name:        string | null;
  template_active:      boolean;
  notes:                string | null;
  created_at:           string;
  lead: {
    id: string; name: string | null; avatar_url: string | null; stage: string; channel: string;
  } | null;
}

const FREQ_LABELS: Record<string, string> = {
  daily:   "Daily",
  weekly:  "Weekly",
  monthly: "Monthly",
  yearly:  "Yearly",
};

function fmtDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
    });
  } catch { return iso; }
}

interface Props {
  booking:  RecurringBookingRow;
  orgId:    string;
  onUpdate: () => void;
  onDelete: (id: string) => void;
}

export function RecurringBookingCard({ booking, orgId, onUpdate, onDelete }: Props) {
  const [acting, setActing] = useState<"toggle" | "delete" | null>(null);

  const lead        = booking.lead;
  const displayName = lead?.name ?? "Unknown lead";
  const initials    = displayName.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  async function toggleActive() {
    setActing("toggle");
    try {
      const res = await fetch(`/api/orgs/${orgId}/bookings/${booking.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ template_active: !booking.template_active }),
      });
      if (res.ok) {
        toast({ title: booking.template_active ? "Recurring paused" : "Recurring resumed", variant: "success" });
        onUpdate();
      } else {
        toast({ title: "Failed to update", variant: "destructive" });
      }
    } finally { setActing(null); }
  }

  async function deleteTemplate() {
    if (!confirm("Delete this recurring booking template? Future sessions will stop. Past bookings are unaffected.")) return;
    setActing("delete");
    try {
      await fetch(`/api/orgs/${orgId}/bookings/${booking.id}`, { method: "DELETE" });
      onDelete(booking.id);
    } finally { setActing(null); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--bg-2)] p-4 space-y-3 transition-colors",
        booking.template_active ? "border-emerald-500/20" : "border-[var(--border)] opacity-70"
      )}
    >
      {/* Row 1: lead + badges */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
          {lead?.avatar_url
            ? <img src={lead.avatar_url} alt={displayName} className="h-full w-full rounded-full object-cover" />
            : initials || <User className="h-4 w-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--text)] truncate">{displayName}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
              <RefreshCw className="h-3 w-3" />
              Recurring
            </span>
            <span className="text-[11px] text-[var(--text-3)] font-medium">
              {FREQ_LABELS[booking.recurrence_frequency]}
            </span>
            {!booking.template_active && (
              <span className="text-[11px] text-amber-400 font-medium">Paused</span>
            )}
          </div>
          {booking.template_name && (
            <p className="text-xs text-[var(--text-2)] mt-0.5 font-medium">{booking.template_name}</p>
          )}
          {booking.notes && (
            <p className="text-xs text-[var(--text-3)] mt-0.5">{booking.notes}</p>
          )}
        </div>
      </div>

      {/* Next run */}
      <div className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-3)] px-3 py-2">
        <div>
          <p className="text-[10px] text-[var(--text-3)]">Next</p>
          <p className="text-xs font-medium text-[var(--text)]">{fmtDt(booking.next_run_at)}</p>
        </div>
        {booking.last_run_at && (
          <div className="ml-auto">
            <p className="text-[10px] text-[var(--text-3)]">Last Run</p>
            <p className="text-xs text-[var(--text-2)]">{fmtDt(booking.last_run_at)}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1 border-t border-[var(--border)]">
        <button
          onClick={toggleActive}
          disabled={!!acting}
          className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors disabled:opacity-50"
        >
          {acting === "toggle"
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : booking.template_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {acting === "toggle" ? "…" : booking.template_active ? "Pause" : "Resume"}
        </button>
        <button
          onClick={deleteTemplate}
          disabled={!!acting}
          className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {acting === "delete" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Delete template
        </button>
      </div>
    </motion.div>
  );
}
