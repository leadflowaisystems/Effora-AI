"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/primitives";
import { Sparkline } from "@/components/ui/sparkline";

interface MetricTileProps {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  delta?: number;        // percentage change
  deltaLabel?: string;
  sparkline?: number[];
  glow?: boolean;
  className?: string;
}

export function MetricTile({
  label,
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  delta,
  deltaLabel,
  sparkline,
  glow = false,
  className,
}: MetricTileProps) {
  const isPositive = delta !== undefined && delta > 0;
  const isNegative = delta !== undefined && delta < 0;
  const isFlat     = delta !== undefined && delta === 0;

  const DeltaIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const deltaColor = isPositive
    ? "text-[var(--brand)]"
    : isNegative
      ? "text-[var(--danger)]"
      : "text-[var(--text-3)]";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-5 transition-all duration-[160ms]",
        "hover:border-[var(--border-strong)]",
        glow && "shadow-jade",
        className
      )}
    >
      {/* Optional jade glow sweep */}
      {glow && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--brand), transparent)" }}
        />
      )}

      {/* Label */}
      <p className="text-xs font-medium text-[var(--text-3)] uppercase tracking-wide mb-2">
        {label}
      </p>

      {/* Big mono number */}
      <div className="flex items-end justify-between gap-2">
        <p className="font-mono text-3xl font-semibold text-[var(--text)] tabular-nums leading-none">
          <CountUp
            value={value}
            decimals={decimals}
            prefix={prefix}
            suffix={suffix}
          />
        </p>

        {sparkline && sparkline.length > 1 && (
          <Sparkline
            data={sparkline}
            width={72}
            height={28}
            color={delta !== undefined && delta < 0 ? "var(--danger)" : "var(--brand)"}
          />
        )}
      </div>

      {/* Delta */}
      {delta !== undefined && (
        <div className={cn("flex items-center gap-1 mt-2 text-xs font-medium", deltaColor)}>
          <DeltaIcon className="h-3.5 w-3.5" />
          <span>
            {isPositive ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
          {deltaLabel && (
            <span className="text-[var(--text-3)] font-normal ml-0.5">{deltaLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
