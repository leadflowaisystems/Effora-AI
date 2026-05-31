"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  User, CheckCircle2, StopCircle, AlertTriangle,
  RefreshCw, Clock, IndianRupee, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────
export interface SequenceLead {
  id:         string;
  name:       string | null;
  avatar_url: string | null;
  stage:      string;
  channel:    string;
}

export interface SequenceRun {
  id:           string;
  type:         "dunning" | "ghost_revival";
  status:       "active" | "completed" | "stopped" | "flagged";
  step_current: number;
  step_total:   number;
  metadata:     Record<string, unknown>;
  started_at:   string;
  updated_at:   string;
  stopped_at:   string | null;
  lead:         SequenceLead | null;
}

interface Props {
  run:      SequenceRun;
  orgId:    string;
  onUpdate: () => void;
}

// ── Config ────────────────────────────────────────────────────
const TYPE_CONFIG = {
  dunning: {
    label:     "Dunning",
    icon:      IndianRupee,
    iconColor: "text-amber-400",
    iconBg:    "bg-amber-500/15 border-amber-500/25",
  },
  ghost_revival: {
    label:     "Ghost Revival",
    icon:      Zap,
    iconColor: "text-violet-400",
    iconBg:    "bg-violet-500/15 border-violet-500/25",
  },
} as const;

const STATUS_CONFIG = {
  active:    { label: "Active",    color: "bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20",   icon: RefreshCw },
  completed: { label: "Completed", color: "bg-[var(--bg-3)] text-[var(--brand)] border-[var(--border)]",         icon: CheckCircle2 },
  stopped:   { label: "Stopped",   color: "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]",        icon: StopCircle },
  flagged:   { label: "Needs attention", color: "bg-red-500/10 text-red-400 border-red-500/20",                  icon: AlertTriangle },
} as const;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

export function SequenceCard({ run, orgId, onUpdate }: Props) {
  const [stopping, setStopping] = useState(false);

  const typeCfg   = TYPE_CONFIG[run.type];
  const statusCfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.active;
  const TypeIcon   = typeCfg.icon;
  const StatusIcon = statusCfg.icon;

  const lead        = run.lead;
  const displayName = lead?.name ?? "Unknown lead";
  const initials    = displayName
    .split(" ").slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");

  // Progress bar
  const progress = run.step_total > 0
    ? Math.min(1, run.step_current / run.step_total)
    : 0;

  async function handleStop() {
    if (stopping) return;
    setStopping(true);
    try {
      await fetch(`/api/orgs/${orgId}/sequences`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sequenceRunId: run.id, action: "stop" }),
      });
      onUpdate();
    } finally {
      setStopping(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--bg-2)] p-4 space-y-3 transition-colors",
        run.status === "active"  ? "border-[var(--border)]"  :
        run.status === "flagged" ? "border-red-500/20"       : "border-[var(--border)] opacity-70"
      )}
    >
      {/* ── Row 1: type icon + lead + status ── */}
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border",
          typeCfg.iconBg
        )}>
          <TypeIcon className={cn("h-4 w-4", typeCfg.iconColor)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Lead avatar + name */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                "bg-[var(--bg-3)] text-[var(--text-2)]"
              )}>
                {lead?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={lead.avatar_url}
                    alt={displayName}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  initials || <User className="h-3 w-3" />
                )}
              </div>
              <span className="text-sm font-medium text-[var(--text)] truncate">{displayName}</span>
            </div>

            {/* Type badge */}
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              typeCfg.iconBg, typeCfg.iconColor
            )}>
              <TypeIcon className="h-2.5 w-2.5" />
              {typeCfg.label}
            </span>

            {/* Status badge */}
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              statusCfg.color
            )}>
              <StatusIcon className={cn("h-2.5 w-2.5", run.status === "active" && "animate-spin")} />
              {statusCfg.label}
            </span>
          </div>

          <p className="text-xs text-[var(--text-3)] mt-0.5">
            Started {formatDate(run.started_at)}
            {run.stopped_at && ` · Stopped ${formatDate(run.stopped_at)}`}
          </p>
        </div>
      </div>

      {/* ── Step progress ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-3)]">
          <span>Step {run.step_current} of {run.step_total}</span>
          {run.type === "dunning" && (
            <span>
              {run.step_current === 0
                ? "Waiting for first follow-up"
                : run.step_current >= run.step_total
                ? "All follow-ups sent"
                : `Follow-up ${run.step_current} sent`}
            </span>
          )}
          {run.type === "ghost_revival" && (
            <span>
              {run.step_current === 0
                ? "Waiting for first nudge"
                : run.step_current >= run.step_total
                ? "All nudges sent"
                : `Nudge ${run.step_current} sent`}
            </span>
          )}
        </div>
        <div className="h-1.5 w-full rounded-full bg-[var(--bg-3)] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "h-full rounded-full",
              run.status === "flagged"   ? "bg-red-400"          :
              run.status === "completed" ? "bg-[var(--brand)]"   :
              run.type   === "dunning"   ? "bg-amber-400"        : "bg-violet-400"
            )}
          />
        </div>
      </div>

      {/* ── Metadata notes (e.g. inactive_days) ── */}
      {run.type === "ghost_revival" && typeof run.metadata?.inactive_days === "number" && (
        <p className="text-[11px] text-[var(--text-3)]">
          <Clock className="inline h-3 w-3 mr-0.5 -mt-px" />
          Lead inactive for {run.metadata.inactive_days as number} day{(run.metadata.inactive_days as number) !== 1 ? "s" : ""}
        </p>
      )}

      {/* ── Stop button (active only) ── */}
      {run.status === "active" && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleStop}
            disabled={stopping}
            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-1 text-xs font-medium text-[var(--text-2)] hover:border-red-500/30 hover:text-red-400 disabled:opacity-50 transition-colors"
          >
            <StopCircle className="h-3 w-3" />
            {stopping ? "Stopping…" : "Stop sequence"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
