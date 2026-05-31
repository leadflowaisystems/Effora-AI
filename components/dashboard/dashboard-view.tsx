"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  IndianRupee, Clock, Zap, TrendingUp,
  MessageSquare, Activity, FlaskConical, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "./use-count-up";
import { FunnelChart } from "./funnel-chart";
import { Sparkline }   from "./sparkline";
import { SourceBars }  from "./source-bars";

// ── Types ────────────────────────────────────────────────────
export interface DashboardData {
  funnel: {
    dms: number; qualified: number; booked: number;
    showed: number; paid: number;
  };
  revenue: {
    paid: number; dunning: number; revival: number;
    noshow: number; pipeline: number;
  };
  speed_ms:       number | null;
  ai: {
    messages: number; tokens: number; cost_inr: number;
  };
  sources: Array<{ source: string; leads: number; revenue_inr: number }>;
  sparkline: Array<{ date: string; revenue_inr: number; dms: number; paid: number }>;
  days:     number;
  is_live_fallback: boolean;
}

interface Props {
  initialData: DashboardData;
  orgId:       string;
  isDev:       boolean;
}

type Range = 7 | 30 | 90;

// ── Helpers ──────────────────────────────────────────────────
function formatInr(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}k`;
  return `₹${n}`;
}

function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m ${s}s`;
}

function convPct(a: number, b: number): string {
  if (b === 0) return "–";
  if (a > b)   return "–";   // suppress ratios > 100% — revival leads bypass booking steps
  return `${Math.round((a / b) * 100)}%`;
}

// ── Hero tile ────────────────────────────────────────────────
function HeroTile({
  label, value, sub, icon: Icon, glow, delay = 0,
}: {
  label: string; value: number; sub?: string;
  icon: React.ElementType; glow: string; delay?: number;
}) {
  const displayed = useCountUp(value, 1600, delay);
  const formatted = formatInr(displayed);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay / 1000 + 0.1, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-lg)] border p-5 space-y-3",
        "bg-[var(--bg-2)]",
        glow
      )}
    >
      {/* Radial glow backdrop */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ background: "radial-gradient(ellipse at 30% 40%, var(--brand), transparent 70%)" }} />

      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand)]/15 border border-[var(--brand)]/20">
          <Icon className="h-3.5 w-3.5 text-[var(--brand)]" />
        </div>
        <span className="text-xs font-medium text-[var(--text-3)]">{label}</span>
      </div>

      <div>
        <p className={cn(
          "font-mono text-3xl font-bold tabular-nums text-[var(--brand)]",
          "drop-shadow-[0_0_16px_rgba(54,230,160,0.4)]"
        )}>
          {formatted}
        </p>
        {sub && (
          <p className="mt-1 text-[11px] text-[var(--text-3)]">{sub}</p>
        )}
      </div>
    </motion.div>
  );
}

// ── Stat card ────────────────────────────────────────────────
function StatCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-5",
      className
    )}>
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
      {children}
    </p>
  );
}

// ── Main component ───────────────────────────────────────────
export function DashboardView({ initialData, orgId, isDev }: Props) {
  const [data,      setData]      = useState<DashboardData>(initialData);
  const [range,     setRange]     = useState<Range>(initialData.days as Range);
  const [loading,   setLoading]   = useState(false);
  const [seeding,   setSeeding]   = useState(false);
  const [seedDone,  setSeedDone]  = useState(false);

  const fetchData = useCallback(async (days: Range) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/orgs/${orgId}/dashboard?days=${days}`);
      const json = await res.json();
      setData(json);
      setRange(days);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      await fetch(`/api/orgs/${orgId}/dashboard/seed`, { method: "POST" });
      setSeedDone(true);
      await fetchData(range);
    } finally {
      setSeeding(false);
    }
  }, [orgId, fetchData, range]);

  const { funnel, revenue, speed_ms, ai, sources, sparkline } = data;

  // All bars use the same jade color — opacity modifiers on CSS-variable hex values
  // don't render in Tailwind (requires RGB triplet). Width encodes the funnel shape.
  const funnelSteps = [
    { label: "DMs received", value: funnel.dms,       bgColor: "bg-[var(--brand)]", color: "text-[var(--brand)]" },
    { label: "Qualified",    value: funnel.qualified,  bgColor: "bg-[var(--brand)]", color: "text-[var(--brand)]" },
    { label: "Booked",       value: funnel.booked,     bgColor: "bg-[var(--brand)]", color: "text-[var(--brand)]" },
    { label: "Showed",       value: funnel.showed,     bgColor: "bg-[var(--brand)]", color: "text-[var(--brand)]" },
    { label: "Paid",         value: funnel.paid,       bgColor: "bg-[var(--brand)]", color: "text-[var(--brand)]" },
  ];

  const sparkData = sparkline.map((s) => s.revenue_inr);
  const totalRecovered = revenue.dunning + revenue.revival + revenue.noshow;

  return (
    <div className={cn("space-y-6 transition-opacity duration-200", loading && "opacity-60 pointer-events-none")}>

      {/* ── Dev bar ──────────────────────────────────────────── */}
      {isDev && (
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-amber-500/20 bg-amber-500/5 px-3 py-2 max-w-3xl">
          <span className="text-[11px] text-amber-500/70 font-mono uppercase tracking-wide">dev</span>
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
          >
            {seeding
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Seeding…</>
              : <><FlaskConical className="h-3.5 w-3.5" /> {seedDone ? "Re-seed demo data" : "Seed demo data"}</>}
          </button>
          {seedDone && <span className="text-[11px] text-amber-400/70">✓ Demo data loaded</span>}
        </div>
      )}

      {/* ── Range selector ───────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-1">
          {([7, 30, 90] as Range[]).map((d) => (
            <button
              key={d}
              onClick={() => fetchData(d)}
              className={cn(
                "rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium transition-colors",
                range === d
                  ? "bg-[var(--bg-3)] text-[var(--text)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-2)]"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
        {data.is_live_fallback && (
          <p className="text-[11px] text-[var(--text-3)]">
            Live data · metrics_daily populates after first 1 AM UTC cron run
          </p>
        )}
      </div>

      {/* ── Hero revenue tiles ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroTile
          label="Total collected"
          value={revenue.paid}
          sub={`${funnel.paid} client${funnel.paid !== 1 ? "s" : ""} paid`}
          icon={IndianRupee}
          glow="border-[var(--brand)]/20"
          delay={0}
        />
        <HeroTile
          label="Recovered — dunning"
          value={revenue.dunning}
          sub={revenue.dunning > 0 ? "Payment follow-ups" : "No dunning wins yet"}
          icon={TrendingUp}
          glow="border-amber-500/20"
          delay={100}
        />
        <HeroTile
          label="Recovered — revival"
          value={revenue.revival}
          sub={revenue.revival > 0 ? "Ghost revival wins" : "No revival wins yet"}
          icon={Zap}
          glow="border-violet-500/20"
          delay={200}
        />
        <HeroTile
          label="No-show recovery"
          value={revenue.noshow}
          sub={`Pipeline: ${formatInr(revenue.pipeline)}`}
          icon={Activity}
          glow="border-blue-500/20"
          delay={300}
        />
      </div>

      {/* ── Funnel + Revenue trend ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatCard>
          <CardLabel>Conversion funnel</CardLabel>
          <FunnelChart steps={funnelSteps} />
          {funnel.paid > funnel.booked && (
            <p className="mt-2 text-xs text-[var(--text-3)]">
              Paid includes leads who paid without booking a call (via revival or direct pay). That&apos;s why Paid can exceed Booked.
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-4">
            <div>
              <p className="text-[11px] text-[var(--text-3)]">DM → Paid</p>
              <p className="font-mono text-lg font-semibold text-[var(--text)]">
                {convPct(funnel.paid, funnel.dms)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--text-3)]">
                Showed → Paid
              </p>
              <p className="font-mono text-lg font-semibold text-[var(--text)]">
                {convPct(funnel.paid, funnel.showed)}
              </p>
            </div>
          </div>
        </StatCard>

        <StatCard>
          <CardLabel>Revenue trend — {range}d</CardLabel>
          <div className="w-full">
            <Sparkline
              data={sparkData.length >= 2 ? sparkData : [0, 0]}
              width={320}
              height={80}
              fill
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3">
            <div>
              <p className="text-[11px] text-[var(--text-3)]">Collected</p>
              <p className="font-mono text-sm font-semibold text-[var(--brand)]">
                {formatInr(revenue.paid)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--text-3)]">Recovered</p>
              <p className="font-mono text-sm font-semibold text-amber-400">
                {formatInr(totalRecovered)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--text-3)]">Pipeline</p>
              <p className="font-mono text-sm font-semibold text-[var(--text)]">
                {formatInr(revenue.pipeline)}
              </p>
            </div>
          </div>
        </StatCard>
      </div>

      {/* ── Sources + Speed-to-lead + AI cost ───────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Source attribution */}
        <StatCard className="lg:col-span-1">
          <CardLabel>Top sources by revenue</CardLabel>
          <SourceBars data={sources} />
        </StatCard>

        {/* Speed to lead */}
        <StatCard>
          <CardLabel>Speed to first reply</CardLabel>
          <div className="flex flex-col items-center justify-center h-28 gap-1">
            {speed_ms !== null ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-5 w-5 text-[var(--brand)]" />
                  <span className="font-mono text-3xl font-bold text-[var(--text)]">
                    {formatMs(speed_ms)}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-3)]">median DM → first reply</p>
              </>
            ) : (
              <>
                <Clock className="h-8 w-8 text-[var(--text-3)]" />
                <p className="text-sm text-[var(--text-3)]">Not enough data yet</p>
              </>
            )}
          </div>
          <div className="border-t border-[var(--border)] pt-3 mt-1">
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
              Fast replies convert more leads. Sub-5-minute median = 3× higher booking rate.
            </p>
          </div>
        </StatCard>

        {/* AI cost panel */}
        <StatCard>
          <CardLabel>AI usage — {range}d</CardLabel>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-3)]">
                <MessageSquare className="h-4 w-4 text-[var(--brand)]" />
              </div>
              <div>
                <p className="font-mono text-lg font-semibold tabular-nums text-[var(--text)]">
                  {ai.messages.toLocaleString("en-IN")}
                </p>
                <p className="text-[11px] text-[var(--text-3)]">AI messages sent</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-3)]">
                <Activity className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <p className="font-mono text-lg font-semibold tabular-nums text-[var(--text)]">
                  {ai.tokens >= 1000 ? `${(ai.tokens / 1000).toFixed(1)}k` : ai.tokens.toString()}
                </p>
                <p className="text-[11px] text-[var(--text-3)]">tokens used</p>
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[var(--text-3)]">Est. AI cost</p>
                <p className="font-mono text-base font-semibold text-amber-400">
                  ₹{ai.cost_inr.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[var(--text-3)]">ROI</p>
                <p className="font-mono text-base font-semibold text-[var(--brand)]">
                  {ai.cost_inr > 0
                    ? `${Math.min(Math.round(revenue.paid / Math.max(ai.cost_inr, 1)), 999)}×${Math.round(revenue.paid / Math.max(ai.cost_inr, 1)) >= 999 ? "+" : ""}`
                    : "999×+"}
                </p>
              </div>
            </div>
          </div>
        </StatCard>
      </div>

      {/* ── Analytics row ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard>
          <CardLabel>DMs processed today</CardLabel>
          <div className="flex flex-col items-center justify-center h-20 gap-1">
            <p className="font-mono text-3xl font-bold text-[var(--brand)]">
              {sparkline.length > 0 ? (sparkline[sparkline.length - 1]?.dms ?? 0) : 0}
            </p>
            <p className="text-[11px] text-[var(--text-3)]">screenshot threads today</p>
          </div>
        </StatCard>

        <StatCard>
          <CardLabel>Avg reply time</CardLabel>
          <div className="flex flex-col items-center justify-center h-20 gap-1">
            {speed_ms !== null ? (
              <>
                <p className="font-mono text-3xl font-bold text-[var(--brand)]">
                  {Math.round(speed_ms / 1000)}s
                </p>
                <p className="text-[11px] text-[var(--text-3)]">Industry avg: 90 min</p>
              </>
            ) : (
              <>
                <p className="font-mono text-3xl font-bold text-[var(--text-3)]">—</p>
                <p className="text-[11px] text-[var(--text-3)]">Industry avg: 90 min</p>
              </>
            )}
          </div>
        </StatCard>

        <StatCard>
          <CardLabel>Channel mix — {range}d</CardLabel>
          <div className="space-y-1.5 pt-1">
            {sources.length > 0 ? sources.slice(0, 4).map((s) => {
              const total = sources.reduce((acc, x) => acc + x.leads, 0);
              const pct   = total > 0 ? Math.round((s.leads / total) * 100) : 0;
              return (
                <div key={s.source} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--text-3)] truncate max-w-[70%]">{s.source}</span>
                    <span className="text-[var(--text)] font-mono">{pct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-[var(--bg-3)]">
                    <div className="h-1 rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) : (
              <p className="text-xs text-[var(--text-3)] text-center pt-4">No data yet</p>
            )}
          </div>
        </StatCard>

        <StatCard>
          <CardLabel>Funnel conversion</CardLabel>
          <div className="flex flex-col items-center justify-center h-20 gap-1">
            <p className="font-mono text-3xl font-bold text-[var(--brand)]">
              {convPct(funnel.booked, funnel.dms)}
            </p>
            <p className="text-[11px] text-[var(--text-3)]">
              {funnel.dms} DMs → {funnel.booked} booked
            </p>
          </div>
        </StatCard>
      </div>
    </div>
  );
}
