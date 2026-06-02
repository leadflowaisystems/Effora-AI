"use client";

/**
 * SubCategoryTabs — horizontal pill tabs used for filtering by sub-category.
 * E.g. on Payments: All | Paid | Pending
 * E.g. on Bookings: All | Upcoming | Completed | No Show
 *
 * Matches the design system pill style.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabOption<T extends string = string> {
  value:  T;
  label:  string;
  count?: number;   // optional badge count
  color?: string;   // optional accent color for the active state overrides
}

interface Props<T extends string = string> {
  options:   TabOption<T>[];
  value:     T;
  onChange:  (v: T) => void;
  className?: string;
}

export function SubCategoryTabs<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <div
      className={cn(
        "flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] overflow-hidden w-fit",
        className
      )}
      role="tablist"
      aria-label="Filter category"
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative h-8 px-3 text-xs font-medium transition-colors duration-[120ms]",
              "focus-visible:outline-none focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-[var(--brand)]",
              i > 0 && "border-l border-[var(--border)]",
              active
                ? "bg-[var(--brand)] text-[#0A0A0C] font-semibold z-10 border-l-transparent"
                : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--bg-3)]"
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={cn(
                "ml-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-semibold min-w-[16px] h-4 px-1",
                active ? "bg-[#0A0A0C]/20 text-[#0A0A0C]" : "bg-[var(--bg-3)] text-[var(--text-3)]"
              )}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
