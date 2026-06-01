"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Activity, Ghost, ChevronDown, ChevronRight,
  Clock, User, Zap,
} from "lucide-react";
import { SequenceCard, type SequenceRun, type SequenceLead } from "./sequence-card";
import { cn } from "@/lib/utils";

export interface InactiveLead {
  id:           string;
  name:         string | null;
  avatar_url:   string | null;
  stage:        string;
  channel:      string;
  last_seen_at: string;
  score:        number | null;
}

interface Props {
  initialRuns:           SequenceRun[];
  initialInactiveLeads:  InactiveLead[];
  inactiveDaysThreshold: number;
  orgId:                 string;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

function InactiveLeadRow({
  lead, orgId, onRevived,
}: { lead: InactiveLead; orgId: string; onRevived: () => void }) {
  const [reviving, setReviving] = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const displayName = lead.name ?? "Unknown lead";
  const initials    = displayName
    .split(" ").slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");
  const inactive = daysSince(lead.last_seen_at);

  async function triggerRevival() {
    if (reviving || done) return;
    setReviving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/leads/${lead.id}/revive`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setDone(true);
      onRevived();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setReviving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-3">
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-3)] text-xs font-bold text-[var(--text-2)]">
        {lead.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lead.avatar_url} alt={displayName} className="h-full w-full rounded-full object-cover" />
        ) : (
          initials || <User className="h-3.5 w-3.5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-[var(--text)] truncate">{displayName}</span>
          <span className="text-[11px] text-[var(--text-3)] capitalize">{lead.channel}</span>
        </div>
        <p className="text-[11px] text-[var(--text-3)] flex items-center gap-1 mt-0.5">
          <Clock className="h-3 w-3 shrink-0" />
          Inactive {inactive} day{inactive !== 1 ? "s" : ""} · last seen {formatDate(lead.last_seen_at)}
        </p>
        {error && <p className="text-[11px] text-red-400 mt-0.5">{error}</p>}
      </div>

      <button
        type="button"
        onClick={triggerRevival}
        disabled={reviving || done}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium transition-colors",
          done
            ? "border-[var(--brand)]/20 bg-[var(--brand)]/10 text-[var(--brand)] cursor-default"
            : "border-violet-500/25 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 disabled:opacity-50"
        )}
      >
        <Zap className="h-3 w-3" />
        {done ? "Reviving…" : reviving ? "Starting…" : "Revive"}
      </button>
    </div>
  );
}

type GroupKey = "active" | "completed" | "other";

function groupRuns(runs: SequenceRun[]): Record<GroupKey, SequenceRun[]> {
  return {
    active:    runs.filter((r) => r.status === "active" || r.status === "flagged"),
    completed: runs.filter((r) => r.status === "completed"),
    other:     runs.filter((r) => r.status === "stopped"),
  };
}

function SectionToggle({
  label, icon: Icon, iconColor, count, open, onToggle,
}: {
  label: string; icon: React.ElementType; iconColor: string;
  count: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 py-1.5 text-left select-none group"
    >
      <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
      <span className={cn("text-sm font-semibold", iconColor)}>{label}</span>
      <span className="ml-1 text-xs text-[var(--text-3)]">({count})</span>
      <span className="ml-auto text-[var(--text-3)] group-hover:text-[var(--text-2)] transition-colors">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </span>
    </button>
  );
}

export function SequencesView({
  initialRuns, initialInactiveLeads, inactiveDaysThreshold, orgId,
}: Props) {
  const router = useRouter();
  const [runs,          setRuns]          = useState<SequenceRun[]>(initialRuns);
  const [inactiveLeads, setInactiveLeads] = useState<InactiveLead[]>(initialInactiveLeads);
  const [open, setOpen] = useState<Record<string, boolean>>({
    active: true, inactive: true,
  });

  const handleUpdate = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/sequences`);
    if (res.ok) {
      const json = await res.json();
      setRuns(json.sequenceRuns ?? []);
      setInactiveLeads(json.inactiveLeads ?? []);
    }
    router.refresh();
  }, [orgId, router]);

  const grouped = groupRuns(runs);
  const hasAnything = runs.length > 0 || inactiveLeads.length > 0;

  if (!hasAnything) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center max-w-2xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-3)]">
          <Activity className="h-7 w-7 text-[var(--text-3)]" />
        </div>
        <div className="space-y-1 max-w-xs">
          <p className="font-display text-base font-semibold text-[var(--text)]">No active sequences</p>
          <p className="text-sm text-[var(--text-3)] leading-relaxed">
            Dunning starts automatically when a payment goes unpaid.
            Ghost revival appears once leads are inactive for {inactiveDaysThreshold}+ days.
          </p>
        </div>
      </div>
    );
  }

  const toggle = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-8 max-w-2xl">

      {/* ── Active sequences ─────────────────────────────────── */}
      {grouped.active.length > 0 && (
        <div className="space-y-3">
          <SectionToggle
            label="Active"
            icon={Activity}
            iconColor="text-[var(--brand)]"
            count={grouped.active.length}
            open={open.active !== false}
            onToggle={() => toggle("active")}
          />
          <AnimatePresence initial={false}>
            {open.active !== false && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pb-1">
                  {grouped.active.map((r) => (
                    <SequenceCard key={r.id} run={r} orgId={orgId} onUpdate={handleUpdate} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Inactive leads (revival candidates) ──────────────── */}
      {inactiveLeads.length > 0 && (
        <div className="space-y-3">
          <SectionToggle
            label={`Inactive Leads (${inactiveDaysThreshold}+ days)`}
            icon={Ghost}
            iconColor="text-violet-400"
            count={inactiveLeads.length}
            open={open.inactive !== false}
            onToggle={() => toggle("inactive")}
          />
          <AnimatePresence initial={false}>
            {open.inactive !== false && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-2 pb-1">
                  <p className="text-xs text-[var(--text-3)]">
                    These leads haven&apos;t messaged in {inactiveDaysThreshold}+ days and aren&apos;t in an active revival sequence.
                    Click Revive to start a 3-nudge AI sequence.
                  </p>
                  {inactiveLeads.map((l) => (
                    <InactiveLeadRow
                      key={l.id}
                      lead={l}
                      orgId={orgId}
                      onRevived={handleUpdate}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Completed sequences ───────────────────────────────── */}
      {grouped.completed.length > 0 && (
        <div className="space-y-3">
          <SectionToggle
            label="Completed"
            icon={ChevronDown}
            iconColor="text-[var(--text-3)]"
            count={grouped.completed.length}
            open={open.completed === true}
            onToggle={() => toggle("completed")}
          />
          <AnimatePresence initial={false}>
            {open.completed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pb-1">
                  {grouped.completed.map((r) => (
                    <SequenceCard key={r.id} run={r} orgId={orgId} onUpdate={handleUpdate} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Stopped sequences ─────────────────────────────────── */}
      {grouped.other.length > 0 && (
        <div className="space-y-3">
          <SectionToggle
            label="Stopped"
            icon={ChevronDown}
            iconColor="text-[var(--text-3)]"
            count={grouped.other.length}
            open={open.stopped === true}
            onToggle={() => toggle("stopped")}
          />
          <AnimatePresence initial={false}>
            {open.stopped && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pb-1">
                  {grouped.other.map((r) => (
                    <SequenceCard key={r.id} run={r} orgId={orgId} onUpdate={handleUpdate} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
