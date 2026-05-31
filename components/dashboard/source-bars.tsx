"use client";

import { motion } from "framer-motion";

interface SourceEntry {
  source:      string;
  leads:       number;
  revenue_inr: number;
}

function formatInr(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(0)}k`;
  return `₹${n}`;
}

const SOURCE_COLORS: Record<string, string> = {
  instagram_reel:  "bg-violet-400",
  instagram_story: "bg-[var(--brand)]",
  instagram_post:  "bg-amber-400",
  manual:          "bg-blue-400",
  // legacy keys
  reel:       "bg-violet-400",
  bio_link:   "bg-[var(--brand)]",
  campaign_a: "bg-amber-400",
  referral:   "bg-blue-400",
  organic:    "bg-[var(--text-3)]",
};

function sourceColor(s: string): string {
  return SOURCE_COLORS[s] ?? "bg-[var(--brand)]";
}

export function SourceBars({ data }: { data: SourceEntry[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-[var(--text-3)]">No source data yet.</p>;
  }

  const maxRev = Math.max(...data.map((d) => d.revenue_inr), 1);

  return (
    <div className="space-y-3">
      {data.map((entry, i) => (
        <div key={entry.source} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--text-2)] capitalize">
              {entry.source.replace(/_/g, " ")}
            </span>
            <div className="flex items-center gap-3 text-[var(--text-3)]">
              <span>{entry.leads} lead{entry.leads !== 1 ? "s" : ""}</span>
              <span className="font-mono font-semibold text-[var(--text)]">
                {formatInr(entry.revenue_inr)}
              </span>
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--bg-3)] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(entry.revenue_inr / maxRev) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className={`h-full rounded-full ${sourceColor(entry.source)}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
