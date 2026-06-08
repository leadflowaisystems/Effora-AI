"use client";

import * as React from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PLAN_FEATURES, PLAN_PRICES, PLAN_NAMES } from "@/lib/plan";

interface PricingCardsProps {
  /** If provided, show CTA as "Select plan" (logged-in context) and call onSelect */
  onSelect?: (plan: "starter" | "growth" | "pro") => void;
  /** Currently active plan for the org */
  currentPlan?: string;
  /** Which specific plan is currently loading — only that button shows a spinner */
  loadingPlan?: string | null;
}

const PLANS = ["starter", "growth", "pro"] as const;

const PLAN_BADGES: Record<string, string | null> = {
  starter: null,
  growth:  "Most Popular",
  pro:     "Best for Scaling",
};

export function PricingCards({ onSelect, currentPlan, loadingPlan }: PricingCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {PLANS.map((plan) => {
        const badge      = PLAN_BADGES[plan];
        const isGrowth   = plan === "growth";
        const isCurrent  = currentPlan === plan;
        const isLoading  = loadingPlan === plan;
        const anyLoading = loadingPlan != null;

        return (
          <div
            key={plan}
            className={cn(
              "relative flex flex-col rounded-[var(--radius-lg)] border p-6 transition-shadow",
              isGrowth
                ? "border-[var(--brand)] shadow-[var(--shadow-jade)] bg-[var(--bg-1)]"
                : "border-[var(--border)] bg-[var(--bg-1)]",
            )}
          >
            {badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className={cn(
                  "rounded-full px-3 py-0.5 text-xs font-bold",
                  isGrowth
                    ? "bg-[var(--brand)] text-[#0A0A0C]"
                    : "bg-[var(--bg-3)] text-[var(--text-2)] border border-[var(--border)]",
                )}>
                  {badge}
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className="font-display text-lg font-bold text-[var(--text)]">
                {PLAN_NAMES[plan]}
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-3xl font-bold text-[var(--text)]">
                  ₹{PLAN_PRICES[plan].toLocaleString("en-IN")}
                </span>
                <span className="text-sm text-[var(--text-3)]">/month</span>
              </div>
              <p className="mt-1.5 text-xs text-[var(--text-3)]">
                {plan === "starter" && "Perfect for solo coaches just starting out"}
                {plan === "growth"  && "For coaches growing their client base"}
                {plan === "pro"     && "For established coaches scaling operations"}
              </p>
            </div>

            <ul className="mb-8 flex-1 space-y-2.5">
              {PLAN_FEATURES[plan]?.map((f) => {
                const isComing = f.toLowerCase().includes("coming");
                return (
                  <li key={f} className={cn(
                    "flex items-start gap-2 text-sm",
                    isComing ? "text-[var(--text-3)]" : "text-[var(--text-2)]",
                  )}>
                    <Check className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      isComing ? "text-[var(--text-3)]" : "text-[var(--brand)]",
                    )} />
                    <span className="flex-1">{f.replace(" — coming Q3 2026", "")}</span>
                    {isComing && (
                      <span className="ml-auto shrink-0 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                        Q3 2026
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {onSelect ? (
              <button
                onClick={() => onSelect(plan as "starter" | "growth" | "pro")}
                disabled={isCurrent || anyLoading}
                className={cn(
                  "w-full rounded-[var(--radius-sm)] py-2 text-sm font-medium transition-opacity",
                  isCurrent
                    ? "bg-[var(--bg-3)] text-[var(--text-3)] cursor-default"
                    : isGrowth
                    ? "bg-[var(--brand)] text-[#0A0A0C] hover:opacity-90"
                    : "border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-3)]",
                  // Only dim OTHER buttons, not the one that's loading
                  !isCurrent && anyLoading && !isLoading && "opacity-50",
                )}
              >
                {isCurrent ? "Current plan" : isLoading ? "Loading…" : "Select plan"}
              </button>
            ) : (
              <Link
                href="/onboarding"
                className={cn(
                  "block w-full rounded-[var(--radius-sm)] py-2 text-center text-sm font-medium transition-opacity",
                  isGrowth
                    ? "bg-[var(--brand)] text-[#0A0A0C] hover:opacity-90"
                    : "border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-3)]",
                )}
              >
                Start 15-day free trial
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
