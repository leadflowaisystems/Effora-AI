"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FunnelStep {
  label:    string;
  value:    number;
  color:    string;
  bgColor:  string;
}

interface FunnelChartProps {
  steps: FunnelStep[];
}

function pct(a: number, b: number): string {
  if (b === 0) return "–";
  if (a > b)   return "–";   // revival/direct-pay leads can exceed prior step
  return `${Math.round((a / b) * 100)}%`;
}

export function FunnelChart({ steps }: FunnelChartProps) {
  // DMs (first step) is always 100% wide; every other bar is proportional to it.
  const dmsCount = Math.max(steps[0]?.value ?? 1, 1);

  return (
    <div className="space-y-2.5">
      {steps.map((step, i) => {
        const prev  = i > 0 ? steps[i - 1].value : step.value;
        const conv  = i > 0 ? pct(step.value, prev) : "100%";
        // Minimum 2% so any bar with data shows at least a thin sliver
        const widthPct = step.value > 0
          ? Math.max((step.value / dmsCount) * 100, 2)
          : 0;

        return (
          <div key={step.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text-2)]">{step.label}</span>
              <div className="flex items-center gap-3">
                {i > 0 && (
                  <span className={cn(
                    "font-mono text-[11px]",
                    conv === "–"          ? "text-[var(--text-3)]" :
                    parseInt(conv) >= 70  ? "text-[var(--brand)]"  :
                    parseInt(conv) >= 40  ? "text-amber-400"       : "text-red-400"
                  )}>
                    {conv}
                  </span>
                )}
                <span className="font-mono font-semibold tabular-nums text-[var(--text)]">
                  {step.value.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <div className="relative h-6 w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--bg-3)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                // Use inline style for min-width so tiny bars get a 2px floor even at sub-1% widths
                style={{ minWidth: step.value > 0 ? "2px" : 0 }}
                className={cn("h-full rounded-[var(--radius-sm)]", step.bgColor)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
