"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useMotionValue, animate, AnimatePresence } from "framer-motion";
import {
  Inbox, Plus, Users, Zap, TrendingUp, IndianRupee, MessageSquare,
  CheckCircle2, Circle, ArrowRight, Clock,
} from "lucide-react";
import { NewDmSheet } from "@/components/inbox/new-dm-sheet";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
interface Metric {
  label:     string;
  value:     number;
  prefix?:   string;
  suffix?:   string;
  sparkline: number[];
  icon:      React.ReactNode;
}

interface ChecklistItem {
  key:      string;
  label:    string;
  done:     boolean;
  href:     string;
  caption:  string;
}

interface ActivityItem {
  id:        string;
  icon:      string;
  iconColor: string;
  text:      string;
  timeAgo:   string;
}

interface HomeClientProps {
  userName:         string;
  orgName:          string;
  orgSlug:          string;
  orgId:            string;
  plan:             string;
  trialEndsAt:      string | null;
  greeting:         string;               // "morning" | "afternoon" | "evening"
  metrics:          Metric[];
  checklist:        ChecklistItem[];
  activity:         ActivityItem[];
  motivationalLine: string;
  isPro:            boolean;
  allChecklistDone: boolean;
}

/* ─────────────────────────────────────────────────────────────
   Animated number counter
───────────────────────────────────────────────────────────── */
function AnimatedNumber({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = React.useState("0");

  React.useEffect(() => {
    const controls = animate(motionVal, to, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(
        prefix +
        (to >= 1000
          ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString())
          : Math.round(v).toString()) +
        suffix
      ),
    });
    return controls.stop;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  return <span>{display}</span>;
}

/* ─────────────────────────────────────────────────────────────
   Micro sparkline
───────────────────────────────────────────────────────────── */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 56; const h = 20;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Trial countdown ring (SVG)
───────────────────────────────────────────────────────────── */
function TrialRing({ daysLeft, totalDays = 14 }: { daysLeft: number; totalDays?: number }) {
  const pct   = Math.max(0, Math.min(1, daysLeft / totalDays));
  const r     = 10;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * pct;

  return (
    <svg width="28" height="28" className="shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="var(--bg-3)" strokeWidth="2" />
      <circle
        cx="14" cy="14" r={r} fill="none"
        stroke="var(--brand)" strokeWidth="2"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────── */
export function HomeClient({
  userName,
  orgName,
  orgSlug,
  orgId,
  plan,
  trialEndsAt,
  greeting,
  metrics,
  checklist,
  activity,
  motivationalLine,
  isPro,
  allChecklistDone,
}: HomeClientProps) {
  const [dmOpen, setDmOpen] = React.useState(false);

  // Days left in trial
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : 14;

  const isSubscribed = plan !== "trial" && plan !== "cancelled";
  const planLabel    = plan === "trial"     ? null
                     : plan === "cancelled" ? "Cancelled"
                     : plan.charAt(0).toUpperCase() + plan.slice(1);

  const totalChecklist = checklist.length;
  const doneChecklist  = checklist.filter((c) => c.done).length;

  return (
    <>
      <div className="relative space-y-7 overflow-hidden">
        {/* ── Jade radial glow behind everything ── */}
        <motion.div
          className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(54,230,160,0.07) 0%, transparent 70%)",
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* ── Hero greeting ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] px-6 py-5 overflow-hidden"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="font-display text-xl font-semibold text-[var(--text)]">
                Good {greeting},{" "}
                <span className="text-[var(--brand)]">{userName}</span>
              </p>
              <p className="text-sm text-[var(--text-3)]">
                {orgName} is live and listening for new leads.
              </p>
            </div>

            {/* Trial ring or plan badge */}
            {isSubscribed && planLabel ? (
              <div className="shrink-0 flex items-center gap-1.5 rounded-full border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-3 py-1.5">
                <Zap className="h-3 w-3 text-[var(--brand)]" />
                <span className="font-mono text-xs font-semibold text-[var(--brand)]">{planLabel}</span>
              </div>
            ) : plan === "trial" && daysLeft > 0 ? (
              <div className="shrink-0 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5">
                <TrialRing daysLeft={daysLeft} />
                <span className="font-mono text-xs text-[var(--text-2)]">
                  {daysLeft}d left
                </span>
              </div>
            ) : null}
          </div>
        </motion.div>

        {/* ── Onboarding checklist ── */}
        <AnimatePresence>
          {!allChecklistDone && (
            <motion.div
              key="checklist"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-4"
            >
              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-2)]">
                    {doneChecklist} of {totalChecklist} setup steps complete
                  </span>
                  <span className="font-mono text-xs text-[var(--brand)]">
                    {Math.round((doneChecklist / totalChecklist) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[var(--brand)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${(doneChecklist / totalChecklist) * 100}%` }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2">
                {checklist.map((item, i) => (
                  <motion.div
                    key={item.key}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 + i * 0.05, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5"
                  >
                    <motion.div
                      initial={item.done ? { scale: 0 } : {}}
                      animate={item.done ? { scale: 1 } : {}}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    >
                      {item.done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-[var(--text-3)] opacity-40" />
                      )}
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-medium truncate", item.done ? "text-[var(--text-3)] line-through" : "text-[var(--text)]")}>
                        {item.label}
                      </p>
                      <p className="text-[10px] text-[var(--text-3)] truncate">{item.caption}</p>
                    </div>
                    {!item.done && (
                      <Link
                        href={item.href}
                        className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-[var(--brand)] hover:opacity-80 transition-opacity"
                      >
                        Complete <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Metrics row ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {metrics.map((m, i) => {
            const isEmpty = m.value === 0;
            return (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 + i * 0.06, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -2, transition: { duration: 0.15 } }}
                className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4 transition-all duration-200 hover:border-[var(--brand)]/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[var(--text-3)]">{m.icon}</span>
                  {!isEmpty && <Sparkline values={m.sparkline} />}
                </div>
                <p className="font-mono text-2xl font-bold text-[var(--text)] tabular-nums" style={{ textShadow: "0 0 20px rgba(54,230,160,0.3)" }}>
                  {isEmpty ? (
                    <span className="text-[var(--text-3)]">—</span>
                  ) : (
                    <AnimatedNumber to={m.value} prefix={m.prefix} suffix={m.suffix} />
                  )}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-3)]">{m.label}</p>
                {isEmpty && (
                  <p className="mt-1.5 text-[10px] text-[var(--text-3)] leading-relaxed italic">
                    Lights up when leads land
                  </p>
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {/* ── Quick actions ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
          className="flex flex-wrap gap-3"
        >
          <Link
            href={`/org/${orgSlug}/inbox`}
            className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[#0A0A0C] hover:bg-[var(--brand-hover)] transition-colors"
          >
            <Inbox className="h-4 w-4" /> Open Inbox
          </Link>

          <button
            onClick={() => setDmOpen(true)}
            className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-1)] px-4 py-2.5 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:border-[var(--brand)]/40 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add test lead
          </button>

          {isPro ? (
            <Link
              href={`/org/${orgSlug}/settings`}
              className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-1)] px-4 py-2.5 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
            >
              <Users className="h-4 w-4" /> Invite teammate
            </Link>
          ) : (
            <div className="relative group">
              <button
                disabled
                className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-1)] px-4 py-2.5 text-sm font-medium text-[var(--text-3)] opacity-50 cursor-not-allowed"
              >
                <Users className="h-4 w-4" /> Invite teammate
              </button>
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex whitespace-nowrap rounded-md bg-[var(--bg-3)] border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-2)] shadow-lg pointer-events-none z-10">
                Pro plan only
              </div>
            </div>
          )}
        </motion.div>

        {/* ── Recent activity ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.24 }}
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">Recent activity</p>
            <Clock className="h-3.5 w-3.5 text-[var(--text-3)]" />
          </div>

          {activity.length === 0 ? (
            <div className="px-4 py-8 text-center space-y-2">
              <p className="text-sm text-[var(--text-3)]">Nothing yet.</p>
              <p className="text-xs text-[var(--text-3)]">
                Send a test DM to see how it feels.
              </p>
              <button
                onClick={() => setDmOpen(true)}
                className="mt-2 flex items-center gap-1.5 mx-auto text-xs font-medium text-[var(--brand)] hover:opacity-80 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" /> Simulate a DM
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {activity.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.26 + i * 0.05, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs", item.iconColor)}>
                    {item.icon}
                  </span>
                  <span className="flex-1 min-w-0 text-xs text-[var(--text-2)] truncate">
                    {item.text}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--text-3)]">
                    {item.timeAgo}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Footer strip ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-1)] px-4 py-3"
        >
          <p className="text-[11px] text-[var(--text-3)] italic leading-relaxed">
            {motivationalLine}
          </p>
          <span className="shrink-0 font-mono text-[10px] text-[var(--text-3)] opacity-40">
            Effora AI v0.6
          </span>
        </motion.div>
      </div>

      {/* Simulate DM sheet */}
      <NewDmSheet
        open={dmOpen}
        onOpenChange={setDmOpen}
        orgId={orgId}
        orgSlug={orgSlug}
      />
    </>
  );
}
