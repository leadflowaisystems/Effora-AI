/**
 * Plan limits for Effora AI subscription tiers.
 *
 * LAUNCH DECISION: All features enabled on all paid plans.
 * Differentiation is usage limits only.
 * Trial mirrors Growth limits.
 */

export type PlanTier = "trial" | "starter" | "growth" | "pro" | "cancelled";

export const PLAN_PRICES: Record<string, number> = {
  starter: 2999,
  growth:  7999,
  pro:     19999,
};

export const PLAN_NAMES: Record<string, string> = {
  trial:     "Trial",
  starter:   "Starter",
  growth:    "Growth",
  pro:       "Pro",
  cancelled: "Cancelled",
};

export interface PlanLimits {
  aiMsgsPerMonth:     number;  // -1 = unlimited
  seatsAllowed:       number;  // -1 = unlimited
  channelsAllowed:    number;  // -1 = unlimited
  leadsAllowed:       number;  // -1 = unlimited
  groupsAllowed:      number;  // -1 = unlimited
  groupMembersTotal:  number;  // -1 = unlimited (total across all groups)
  broadcastsPerMonth: number;  // -1 = unlimited
}

// NOTE: All features are unlocked for all plans at launch.
// FUTURE feature gates are marked with comments in access.ts.
const LIMITS: Record<PlanTier, PlanLimits> = {
  trial: {
    aiMsgsPerMonth:     2000,
    seatsAllowed:       3,
    channelsAllowed:    2,
    leadsAllowed:       5000,
    groupsAllowed:      20,
    groupMembersTotal:  2000,
    broadcastsPerMonth: 50,
  },
  starter: {
    aiMsgsPerMonth:     500,
    seatsAllowed:       1,
    channelsAllowed:    2,   // FUTURE: restrict to 1 channel on Starter
    leadsAllowed:       1000,
    groupsAllowed:      5,
    groupMembersTotal:  500,
    broadcastsPerMonth: 10,
  },
  growth: {
    aiMsgsPerMonth:     2000,
    seatsAllowed:       3,
    channelsAllowed:    2,
    leadsAllowed:       5000,
    groupsAllowed:      20,
    groupMembersTotal:  2000,
    broadcastsPerMonth: 50,
  },
  pro: {
    aiMsgsPerMonth:     8000,
    seatsAllowed:       -1,
    channelsAllowed:    -1,
    leadsAllowed:       -1,
    groupsAllowed:      -1,
    groupMembersTotal:  -1,
    broadcastsPerMonth: -1,
  },
  cancelled: {
    aiMsgsPerMonth:     0,
    seatsAllowed:       1,
    channelsAllowed:    1,
    leadsAllowed:       0,
    groupsAllowed:      0,
    groupMembersTotal:  0,
    broadcastsPerMonth: 0,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return LIMITS[(plan as PlanTier)] ?? LIMITS.starter;
}

export function isTrialExpired(plan: string, trialEndsAt: string | null): boolean {
  if (plan !== "trial") return false;
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt) < new Date();
}

export function isAiBlocked(
  plan: string,
  trialEndsAt: string | null,
  monthlyMsgCount: number,
): boolean {
  if (isTrialExpired(plan, trialEndsAt)) return true;
  const limits = getPlanLimits(plan);
  if (limits.aiMsgsPerMonth === 0) return true;
  if (limits.aiMsgsPerMonth === -1) return false;
  return monthlyMsgCount >= limits.aiMsgsPerMonth;
}

export const PLAN_FEATURES: Record<string, string[]> = {
  starter: [
    "AI Reply Assistant — paste any DM, get 3 smart replies",
    "Full CRM — 1,000 leads",
    "Instagram + WhatsApp channels",
    "Groups — 5 groups, up to 500 members",
    "10 broadcasts/month",
    "Manual booking + payment recording",
    "UPI or Razorpay payment links",
    "Cal.com integration + automated reminders",
    "Public funnel page",
    "WhatsApp Business templates",
    "Automated email confirmations + weekly report",
    "500 AI replies/month",
  ],
  growth: [
    "Everything in Starter",
    "Full CRM — 5,000 leads",
    "Groups — 20 groups, 2,000 members",
    "50 broadcasts/month",
    "2,000 AI replies/month",
    "Ghost revival sequences",
    "ManyChat + Instagram integration",
    "3 seats",
    "Priority support",
  ],
  pro: [
    "Everything in Growth",
    "Unlimited CRM leads",
    "Unlimited groups + members",
    "Unlimited broadcasts",
    "8,000 AI replies/month",
    "Unlimited channels",
    "Agency mode (manage client orgs)",
    "Unlimited seats",
    "Dedicated support + onboarding",
    // FUTURE: White-label branding (Pro tier)
    // FUTURE: Custom workflows (Pro tier)
    // FUTURE: Multi-team accounts (Pro tier)
  ],
};

/** Returns pct usage 0-100 (capped), or null if limit is -1 (unlimited) */
export function usagePct(used: number, limit: number): number | null {
  if (limit === -1) return null;
  if (limit === 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function isApproachingLimit(used: number, limit: number): boolean {
  const pct = usagePct(used, limit);
  return pct !== null && pct >= 80;
}

export function isAtLimit(used: number, limit: number): boolean {
  if (limit === -1) return false;
  return used >= limit;
}
