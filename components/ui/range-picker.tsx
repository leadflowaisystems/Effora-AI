"use client";

/**
 * RangePicker — compact segmented control for time range selection.
 *
 * Desktop (md+): horizontal pill group  Today | Week | Month | Year | All
 * Mobile (<md):  native <select> dropdown (avoids overflow / tiny tap targets)
 *
 * Design matches the app's design system:
 *   - Active:   bg-[var(--brand)] text-[#0A0A0C] font-semibold
 *   - Inactive: text-[var(--text-3)] hover:text-[var(--text-2)]
 *   - Container: bordered pill, matches other pill groups in the codebase
 *
 * Persists the selection to localStorage under "effora-range-pref" so
 * reopening the page restores the last choice.
 *
 * Props:
 *   value    — current range key
 *   onChange — called when the user picks a new option
 */

import * as React from "react";
import { RANGES, type Range } from "@/lib/range";
import { cn } from "@/lib/utils";

const LS_KEY = "effora-range-pref";

interface Props {
  value:    Range;
  onChange: (r: Range) => void;
  className?: string;
}

export function RangePicker({ value, onChange, className }: Props) {
  // Sync to localStorage on every change
  const handleChange = React.useCallback(
    (r: Range) => {
      try { localStorage.setItem(LS_KEY, r); } catch { /* SSR / private browsing */ }
      onChange(r);
    },
    [onChange]
  );

  return (
    <div className={cn("flex items-center gap-0", className)}>
      {/* ── Mobile: native select ─────────────────────────────── */}
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value as Range)}
        className={cn(
          "md:hidden",
          "h-8 rounded-[var(--radius-sm)] border border-[var(--border)]",
          "bg-[var(--bg-2)] text-[var(--text-2)] text-xs px-2",
          "focus:outline-none focus:ring-1 focus:ring-[var(--brand)]",
          "appearance-none cursor-pointer"
        )}
        aria-label="Select time range"
      >
        {RANGES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>

      {/* ── Desktop: segmented pill control ─────────────────────── */}
      <div
        className={cn(
          "hidden md:flex",
          "rounded-[var(--radius-sm)] border border-[var(--border)]",
          "bg-[var(--bg-2)] overflow-hidden"
        )}
        role="group"
        aria-label="Time range"
      >
        {RANGES.map((r, i) => {
          const active = r.value === value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => handleChange(r.value)}
              aria-pressed={active}
              className={cn(
                "relative h-8 px-3 text-xs font-medium transition-colors duration-[120ms]",
                "focus-visible:outline-none focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-[var(--brand)]",
                // Divider between segments (skip first)
                i > 0 && "border-l border-[var(--border)]",
                active
                  ? "bg-[var(--brand)] text-[#0A0A0C] font-semibold z-10 border-l-transparent"
                  : "bg-transparent text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--bg-3)]"
              )}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Read the user's last saved range preference from localStorage.
 * Returns null on SSR / if nothing is stored.
 */
export function readStoredRange(): Range | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "today" || v === "week" || v === "month" || v === "year" || v === "all") return v;
  } catch { /* private browsing */ }
  return null;
}
