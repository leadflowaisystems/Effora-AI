"use client";

import * as React from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  orgId: string;
}

interface Milestone {
  type:        string;
  value:       number;
  metadata:    { label?: string };
  achieved_at: string;
}

const DISMISSED_KEY = "Effora AI_dismissed_milestones";

export function MilestoneBanner({ orgId }: Props) {
  const [milestone, setMilestone] = React.useState<Milestone | null>(null);

  React.useEffect(() => {
    let dismissed: string[] = [];
    try { dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]"); } catch { /**/ }

    fetch(`/api/orgs/${orgId}/milestones/latest`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const m = data?.milestone as Milestone | null;
        if (m && !dismissed.includes(`${m.type}:${m.value}`)) {
          setMilestone(m);
          // Auto-dismiss after 5 seconds
          setTimeout(() => dismiss(m), 5000);
        }
      })
      .catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  function dismiss(m: Milestone) {
    try {
      const dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
      dismissed.push(`${m.type}:${m.value}`);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
    } catch { /**/ }
    setMilestone(null);
  }

  return (
    <AnimatePresence>
      {milestone && (
        <motion.div
          key={`${milestone.type}:${milestone.value}`}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3 border-b border-[var(--brand)]/30 bg-[var(--brand)]/8 px-4 py-2.5"
        >
          <span className="text-xs font-medium text-[var(--brand)] flex-1">
            {milestone.metadata?.label ?? `Milestone: ${milestone.type} ${milestone.value}`}
          </span>
          <button
            onClick={() => dismiss(milestone)}
            className="text-[var(--brand)]/60 hover:text-[var(--brand)] transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
