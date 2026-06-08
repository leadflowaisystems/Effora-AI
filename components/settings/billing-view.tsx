"use client";

import * as React from "react";
import { CreditCard, Zap, AlertTriangle, Users, MessageSquare, UsersRound } from "lucide-react";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { getPlanLimits, isTrialExpired, PLAN_NAMES, usagePct } from "@/lib/plan";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface UsageCounts {
  leads:      number;
  groups:     number;
  members:    number;
  broadcasts: number;
}

interface Props {
  orgId:               string;
  plan:                string;
  trialEndsAt:         string;
  subscriptionStatus:  string;
  currentPeriodEnd:    string | null;
  monthlyAiMsgCount:   number;
  usageCounts?:        UsageCounts;
}

export function BillingView({
  orgId,
  plan,
  trialEndsAt,
  subscriptionStatus,
  currentPeriodEnd,
  monthlyAiMsgCount,
  usageCounts,
}: Props) {
  // Track loading per-plan so only the clicked button shows a spinner
  const [loadingPlan, setLoadingPlan] = React.useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = React.useState(false);
  const limits = getPlanLimits(plan);
  const trialExpired = isTrialExpired(plan, trialEndsAt);
  const daysLeft = plan === "trial"
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  async function handleSelect(selectedPlan: "starter" | "growth" | "pro") {
    if (loadingPlan) return; // prevent double-click while another is in flight
    setLoadingPlan(selectedPlan);

    // Open a blank window immediately inside the user-gesture so browsers
    // don't block it as a popup. We'll navigate it to the Razorpay URL once
    // the API responds, or close it if something goes wrong.
    const win = window.open("about:blank", "_blank");

    try {
      const res = await fetch("/api/billing/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ orgId, plan: selectedPlan }),
      });
      const json = await res.json();
      if (json.shortUrl && win) {
        win.location.href = json.shortUrl;
      } else {
        win?.close();
      }
    } catch {
      win?.close();
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your subscription? You'll keep access until the end of the billing period.")) return;
    setCancelLoading(true);
    await fetch("/api/billing/cancel", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ orgId }),
    });
    setCancelLoading(false);
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

        {/* Usage gauges */}
        {limits.aiMsgsPerMonth > 0 && (
          <div className="mt-6 space-y-4">
            <p className="text-xs font-medium text-[var(--text-3)] uppercase tracking-wide">Usage this cycle</p>
            {[
              {
                icon: <Zap className="h-3.5 w-3.5 text-[var(--brand)]" />,
                label: "AI replies this month",
                used:  monthlyAiMsgCount,
                limit: limits.aiMsgsPerMonth,
                resetsMonthly: true,
              },
              ...(usageCounts ? [
                {
                  icon: <Users className="h-3.5 w-3.5 text-blue-400" />,
                  label: "Leads",
                  used:  usageCounts.leads,
                  limit: limits.leadsAllowed,
                  resetsMonthly: false,
                },
                {
                  icon: <UsersRound className="h-3.5 w-3.5 text-purple-400" />,
                  label: "Groups",
                  used:  usageCounts.groups,
                  limit: limits.groupsAllowed,
                  resetsMonthly: false,
                },
                {
                  icon: <Users className="h-3.5 w-3.5 text-amber-400" />,
                  label: "Group members total",
                  used:  usageCounts.members,
                  limit: limits.groupMembersTotal,
                  resetsMonthly: false,
                },
                {
                  icon: <MessageSquare className="h-3.5 w-3.5 text-pink-400" />,
                  label: "Broadcasts this month",
                  used:  usageCounts.broadcasts,
                  limit: limits.broadcastsPerMonth,
                  resetsMonthly: true,
                },
              ] : []),
            ].map(({ icon, label, used, limit, resetsMonthly }) => {
              if (limit === 0) return null;
              const pct = usagePct(used, limit);
              const unlimited = limit === -1;
              const barColor = !pct ? "bg-[var(--brand)]" : pct >= 100 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-[var(--brand)]";

              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
                      {icon} {label}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-2)]">
                        {used.toLocaleString()} {unlimited ? "" : `/ ${limit.toLocaleString()}`}
                        {unlimited && <span className="text-[var(--text-3)]"> (unlimited)</span>}
                      </span>
                      {pct !== null && pct >= 80 && pct < 100 && (
                        <span className="text-[10px] text-amber-400">Approaching limit</span>
                      )}
                      {pct !== null && pct >= 100 && (
                        <Link href="/pricing" className="text-[10px] font-medium text-red-400 hover:underline">Limit reached — upgrade</Link>
                      )}
                    </div>
                  </div>
                  {!unlimited && (
                    <div className="h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", barColor)}
                        style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                    </div>
                  )}
                  {pct !== null && pct >= 80 && pct < 100 && resetsMonthly && (
                    <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                      Resets on the 1st. Upgrade to {plan === "starter" ? "Growth" : "Pro"} for {plan === "starter" ? "4×" : "unlimited"} headroom.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Cancel button */}
        {["active", "trialing"].includes(subscriptionStatus) && plan !== "trial" && (
          <div className="mt-6 pt-4 border-t border-[var(--border)]">
            <button
              onClick={handleCancel}
              disabled={cancelLoading}
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
            loadingPlan={loadingPlan}
          />
        </div>
      )}
    </div>
  );
}
