"use client";

/**
 * TimeRangeFilter — comprehensive time range selector used across CRM,
 * Bookings, Payments, and Lead Detail pages.
 *
 * Desktop (md+): segmented pill control  Today | Week | Month | Year | All | Custom
 * Mobile  (<md): native <select> dropdown with same options
 *
 * "Custom" opens a small inline popover with two <input type="date"> fields.
 * Once both dates are filled the filter applies immediately; a clear button
 * resets to "month".
 *
 * Props:
 *   storageKey  — unique localStorage key per page so preferences don't collide
 *   value       — current named range
 *   customFrom  — ISO string when range === "custom"
 *   customTo    — ISO string when range === "custom"
 *   onChange    — called with (range, from?, to?) on every change
 *   className   — optional wrapper class
 */

import * as React from "react";
import { Calendar, X } from "lucide-react";
import { PRESET_RANGES, parseRange, toDateInputValue, type Range } from "@/lib/range";
import { cn } from "@/lib/utils";

interface Props {
  storageKey:  string;
  value:       Range;
  customFrom?: string | null;
  customTo?:   string | null;
  onChange:    (range: Range, customFrom?: string | null, customTo?: string | null) => void;
  className?:  string;
}

export function TimeRangeFilter({
  storageKey,
  value,
  customFrom,
  customTo,
  onChange,
  className,
}: Props) {
  const [showCustom, setShowCustom] = React.useState(value === "custom");
  const [fromVal,    setFromVal]    = React.useState(customFrom ? toDateInputValue(customFrom) : "");
  const [toVal,      setToVal]      = React.useState(customTo   ? toDateInputValue(customTo)   : "");
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Persist to localStorage
  const save = React.useCallback(
    (r: Range, cf?: string | null, ct?: string | null) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ range: r, from: cf ?? null, to: ct ?? null }));
      } catch { /* private browsing */ }
    },
    [storageKey]
  );

  function handlePreset(r: Range) {
    setShowCustom(false);
    save(r);
    onChange(r, null, null);
  }

  function handleCustomConfirm(from: string, to: string) {
    if (!from || !to) return;
    const fromIso = new Date(from).toISOString();
    const toIso   = new Date(to + "T23:59:59").toISOString();
    save("custom", fromIso, toIso);
    onChange("custom", fromIso, toIso);
  }

  function handleFromChange(v: string) {
    setFromVal(v);
    if (v && toVal) handleCustomConfirm(v, toVal);
  }

  function handleToChange(v: string) {
    setToVal(v);
    if (fromVal && v) handleCustomConfirm(fromVal, v);
  }

  function clearCustom() {
    setFromVal("");
    setToVal("");
    setShowCustom(false);
    save("month");
    onChange("month", null, null);
  }

  // Close custom popover when clicking outside
  React.useEffect(() => {
    if (!showCustom) return;
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        if (!fromVal || !toVal) clearCustom();
        else setShowCustom(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCustom, fromVal, toVal]);

  const mobileOptions = [
    ...PRESET_RANGES,
    { value: "custom" as Range, label: "Custom" },
  ];

  function handleMobileChange(r: Range) {
    if (r === "custom") { setShowCustom(true); }
    else { handlePreset(r); }
  }

  const displayLabel = value === "custom" && fromVal && toVal
    ? `${fromVal} → ${toVal}`
    : value === "custom" ? "Custom"
    : null;

  return (
    <div className={cn("relative", className)} ref={popoverRef}>
      <div className="flex items-center gap-2">
        {/* ── Mobile: native select ─────────────────────────── */}
        <select
          value={value}
          onChange={(e) => handleMobileChange(e.target.value as Range)}
          className={cn(
            "md:hidden h-8 min-w-[90px]",
            "rounded-[var(--radius-sm)] border border-[var(--border)]",
            "bg-[var(--bg-2)] text-[var(--text-2)] text-xs px-2",
            "focus:outline-none focus:ring-1 focus:ring-[var(--brand)]",
            "appearance-none cursor-pointer"
          )}
          aria-label="Select time range"
        >
          {mobileOptions.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {/* ── Desktop: segmented pill ───────────────────────── */}
        <div
          className="hidden md:flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] overflow-hidden"
          role="group"
          aria-label="Time range"
        >
          {PRESET_RANGES.map((r, i) => {
            const active = r.value === value && !showCustom;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => handlePreset(r.value)}
                aria-pressed={active}
                className={cn(
                  "h-8 px-3 text-xs font-medium transition-colors duration-[120ms]",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)]",
                  i > 0 && "border-l border-[var(--border)]",
                  active
                    ? "bg-[var(--brand)] text-[#0A0A0C] font-semibold border-l-transparent"
                    : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--bg-3)]"
                )}
              >
                {r.label}
              </button>
            );
          })}

          {/* Custom trigger */}
          <button
            type="button"
            onClick={() => { setShowCustom((v) => !v); }}
            aria-pressed={value === "custom"}
            className={cn(
              "h-8 px-3 text-xs font-medium transition-colors duration-[120ms] border-l border-[var(--border)]",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)]",
              "flex items-center gap-1",
              value === "custom"
                ? "bg-[var(--brand)] text-[#0A0A0C] font-semibold border-l-transparent"
                : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--bg-3)]"
            )}
          >
            <Calendar className="h-3 w-3" />
            {displayLabel ?? "Custom"}
          </button>
        </div>

        {/* Clear button for active custom range */}
        {value === "custom" && !showCustom && (
          <button
            type="button"
            onClick={clearCustom}
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--bg-3)] transition-colors"
            aria-label="Clear custom range"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Custom date popover ─────────────────────────────── */}
      {showCustom && (
        <div className={cn(
          "absolute right-0 top-10 z-50",
          "rounded-[var(--radius-md)] border border-[var(--border)]",
          "bg-[var(--bg-1)] shadow-elevated p-4 space-y-3",
          "min-w-[260px]"
        )}>
          <p className="text-xs font-semibold text-[var(--text-2)]">Custom date range</p>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-[11px] text-[var(--text-3)]">From</label>
              <input
                type="date"
                value={fromVal}
                max={toVal || undefined}
                onChange={(e) => handleFromChange(e.target.value)}
                className={cn(
                  "w-full h-8 rounded-[var(--radius-sm)] border border-[var(--border)]",
                  "bg-[var(--bg-3)] text-[var(--text)] text-xs px-2",
                  "focus:outline-none focus:ring-1 focus:ring-[var(--brand)]",
                  "cursor-pointer"
                )}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[var(--text-3)]">To</label>
              <input
                type="date"
                value={toVal}
                min={fromVal || undefined}
                onChange={(e) => handleToChange(e.target.value)}
                className={cn(
                  "w-full h-8 rounded-[var(--radius-sm)] border border-[var(--border)]",
                  "bg-[var(--bg-3)] text-[var(--text)] text-xs px-2",
                  "focus:outline-none focus:ring-1 focus:ring-[var(--brand)]",
                  "cursor-pointer"
                )}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { if (fromVal && toVal) { handleCustomConfirm(fromVal, toVal); setShowCustom(false); } }}
              disabled={!fromVal || !toVal}
              className={cn(
                "flex-1 h-7 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors",
                "bg-[var(--brand)] text-[#0A0A0C] hover:opacity-90",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={clearCustom}
              className="h-7 px-3 rounded-[var(--radius-sm)] text-xs text-[var(--text-3)] border border-[var(--border)] hover:bg-[var(--bg-3)] transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Read stored filter state from localStorage.
 * Returns null if nothing is stored or on SSR.
 */
export function readStoredFilter(storageKey: string): {
  range: Range;
  from: string | null;
  to: string | null;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      range: parseRange(parsed.range),
      from:  parsed.from ?? null,
      to:    parsed.to   ?? null,
    };
  } catch { return null; }
}
