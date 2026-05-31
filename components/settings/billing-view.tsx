"use client";

import * as React from "react";
import { CreditCard, Zap, AlertTriangle } from "lucide-react";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { getPlanLimits, isTrialExpired, PLAN_NAMES } from "@/lib/plan";
import { cn } from "@/lib/utils";

interface Props {
  orgId:               string;
  plan:                string;
  trialEndsAt:         string;
  subscriptionStatus:  string;
  currentPeriodEnd:    string | null;
  monthlyAiMsgCount:   number;
}

export function BillingView({
  orgId,
  plan,
  trialEndsAt,
  subscriptionStatus,
  currentPeriodEnd,
  monthlyAiMsgCount,
}: Props) {
  const [loading, setLoading] = React.useState(false);
  const limits = getPlanLimits(plan);
  const trialExpired = isTrialExpired(plan, trialEndsAt);
  const daysLeft = plan === "trial"
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  async function handleSelect(selectedPlan: "starter" | "growth" | "pro") {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ orgId, plan: selectedPlan }),
      });
      const json = await res.json();
      if (json.shortUrl) window.open(json.shortUrl, "_blank");
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleCancel() {
    if (!confirm("Cancel your subscription? You'll keep access until the end of the billing period.")) return;
    setLoading(true);
    await fetch("/api/billing/cancel", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ orgId }),
    });
    setLoading(false);
    window.location.reload();
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Billing</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Manage your Effora AI subscription and plan.
        </p>
      </div>

      {/* Current plan card */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-3)]">
              <CreditCard className="h-5 w-5 text-[var(--brand)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--text)]">
                {PLAN_NAMES[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
              </p>
              <p className="text-sm text-[var(--text-3)]">
                {subscriptionStatus === "active"
                  ? currentPeriodEnd
                    ? `Renews ${new Date(currentPeriodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`
                    : "Active"
                  : plan === "trial"
                  ? trialExpired
                    ? "Trial expired"
                    : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in trial`
                  : subscriptionStatus}
              </p>
            </div>
          </div>

          <span className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            plan === "trial" && !trialExpired  && "bg-[var(--bg-3)] text-[var(--warn)]",
            plan === "trial" && trialExpired   && "bg-red-950 text-red-400",
            plan === "growth" || plan === "pro"  ? "bg-[var(--brand-glow)] text-[var(--brand)]" : "",
            plan === "cancelled"               && "bg-[var(--bg-3)] text-[var(--text-3)]",
          )}>
            {plan === "trial" ? (trialExpired ? "Expired" : "Trial") : plan.charAt(0).toUpperCase() + plan.slice(1)}
          </span>
        </div>

        {/* AI usage bar */}
        {limits.aiMsgsPerMonth > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-sm text-[var(--text-3)]">
                <Zap className="h-3.5 w-3.5 text-[var(--brand)]" />
                AI replies this month
              </div>
              <span className="text-sm text-[var(--text-2)]">
                {monthlyAiMsgCount.toLocaleString()} / {limits.aiMsgsPerMonth.toLocaleString()}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-3)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-all"
                style={{ width: `${Math.min(100, (monthlyAiMsgCount / limits.aiMsgsPerMonth) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Cancel button */}
        {["active", "trialing"].includes(subscriptionStatus) && plan !== "trial" && (
          <div className="mt-6 pt-4 border-t border-[var(--border)]">
            <button
              onClick={handleCancel}
              disabled={loading}
              className="text-sm text-[var(--text-3)] hover:text-[var(--danger)] transition-colors"
            >
              Cancel subscription
            </button>
          </div>
        )}
      </div>

      {/* Trial expired warning */}
      {trialExpired && (
        <div className="flex items-start gap-3 rounded-[var(--radius)] border border-amber-800/40 bg-amber-950/20 p-4">
          <AlertTriangle className="h-4 w-4 text-[var(--warn)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Trial ended</p>
            <p className="text-sm text-[var(--text-3)] mt-0.5">
              AI generation is paused. Pick a plan below to continue automating replies.
            </p>
          </div>
        </div>
      )}

      {/* Upgrade section */}
      {plan !== "pro" && (
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text)] mb-4">
            {plan === "trial" ? "Choose a plan" : "Upgrade"}
          </h2>
          <PricingCards
            onSelect={handleSelect}
            currentPlan={plan === "trial" ? undefined : plan}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
}
