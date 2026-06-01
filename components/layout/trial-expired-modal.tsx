"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isTrialExpired } from "@/lib/plan";
import { PLAN_PRICES, PLAN_NAMES, PLAN_FEATURES } from "@/lib/plan";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  plan:        string;
  trialEndsAt: string | null;
  orgSlug:     string;
  subStatus?:  string;  // passed from layout for past_due detection
}

const BLOCKED_PLANS = new Set(["cancelled", "halted"]);
const UPGRADE_PLANS = ["starter", "growth", "pro"] as const;

export function TrialExpiredModal({ plan, trialEndsAt, orgSlug, subStatus }: Props) {
  const router   = useRouter();
  const expired  = isTrialExpired(plan, trialEndsAt);
  const isPastDue = subStatus === "past_due";
  const isCancelled = BLOCKED_PLANS.has(plan) || BLOCKED_PLANS.has(subStatus ?? "");

  // Show when: trial expired, past_due, or cancelled
  const shouldBlock = expired || isPastDue || isCancelled;
  if (!shouldBlock) return null;

  const headline = expired
    ? "Your free trial has ended"
    : isPastDue
    ? "Payment failed — access paused"
    : "Your subscription is cancelled";

  const body = expired
    ? "AI replies, lead scoring, and automations are paused. Pick a plan to keep your pipeline moving."
    : isPastDue
    ? "We couldn't charge your card. Update your payment method to restore full access."
    : "Your subscription was cancelled. Reactivate to resume AI replies and automations.";

  async function signOut() {
    const sb = createClient();
    await sb.auth.signOut();
    router.push("/login");
  }

  return (
    <AnimatePresence>
      <motion.div
        key="trial-blocker-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-4 pt-12"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-1)] p-8 shadow-2xl"
        >
          {/* Sign out — top-right corner */}
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="absolute right-4 top-4 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>

          {/* Icon */}
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-7 w-7 text-amber-400" />
          </div>

          {/* Copy */}
          <h2 className="font-display text-xl font-semibold text-[var(--text)] mb-2">
            {headline}
          </h2>
          <p className="text-sm text-[var(--text-2)] leading-relaxed mb-8">
            {body}
          </p>

          {/* Plan cards — three compact cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-6">
            {UPGRADE_PLANS.map((p) => (
              <div
                key={p}
                className={cn(
                  "rounded-[var(--radius-md)] border p-4 flex flex-col gap-3",
                  p === "growth"
                    ? "border-[var(--brand)] bg-[var(--brand-glow)]"
                    : "border-[var(--border)] bg-[var(--bg-2)]"
                )}
              >
                <div>
                  <p className="text-xs font-semibold text-[var(--text)] uppercase tracking-wide">
                    {PLAN_NAMES[p]}
                    {p === "growth" && (
                      <span className="ml-1.5 rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[9px] font-bold text-[#0A0A0C]">
                        Popular
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-lg font-bold text-[var(--text)] mt-0.5">
                    ₹{PLAN_PRICES[p].toLocaleString("en-IN")}
                    <span className="text-xs text-[var(--text-3)] font-normal">/mo</span>
                  </p>
                </div>
                <ul className="space-y-1">
                  {(PLAN_FEATURES[p] ?? []).slice(0, 3).map((f) => (
                    <li key={f} className="text-[11px] text-[var(--text-3)] leading-relaxed truncate">
                      · {f.replace(" — coming Q3 2026", "")}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/org/${orgSlug}/settings/billing`}
                  className={cn(
                    "mt-auto block w-full rounded-[var(--radius-sm)] py-2 text-center text-xs font-semibold transition-opacity",
                    p === "growth"
                      ? "bg-[var(--brand)] text-[#0A0A0C] hover:opacity-90"
                      : "border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-3)]"
                  )}
                >
                  Select {PLAN_NAMES[p]}
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-[var(--text-3)]">
            Your data is safe and read-only until you subscribe.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
