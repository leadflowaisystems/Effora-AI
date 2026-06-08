/**
 * Plan limits for Effora AI subscription tiers.
 *
 * Plans: Starter ₹999/mo · Growth ₹2,999/mo · Pro ₹5,999/mo
 * 15-day full-feature free trial.
 */

export type PlanTier = "trial" | "starter" | "growth" | "pro" | "cancelled";

export const PLAN_PRICES: Record<string, number> = {
  starter: 999,
  growth:  2999,
  pro:     5999,
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
    channelsAllowed:    2,
    leadsAllowed:       2000,
    groupsAllowed:      10,
    groupMembersTotal:  500,
    broadcastsPerMonth: 0,   // broadcasts blocked by feature gate on starter
  },
  growth: {
    aiMsgsPerMonth:     5000,
    seatsAllowed:       2,
    channelsAllowed:    2,
    leadsAllowed:       10000,
    groupsAllowed:      -1,
    groupMembersTotal:  -1,
    broadcastsPerMonth: -1,
  },
  pro: {
    aiMsgsPerMonth:     20000,
    seatsAllowed:       5,
    channelsAllowed:    -1,
    leadsAllowed:       50000,
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
    "Full CRM — 2,000 leads",
    "Instagram + WhatsApp channels",
    "Groups — 10 groups",
    "Manual booking + payment recording",
    "UPI or Razorpay payment links",
    "Cal.com integration + automated reminders",
    "Public funnel page",
    "Email confirmations + weekly report",
    "500 AI replies/month",
  ],
  growth: [
    "Everything in Starter",
    "Full CRM — 10,000 leads",
    "Unlimited groups + members",
    "Broadcasts (mass messaging)",
    "Ghost revival sequences",
    "Recurring payments",
    "Scheduled messages",
    "Trends & insights",
    "Screenshot / OCR parsing",
    "2 seats",
    "5,000 AI replies/month",
    "Priority support",
  ],
  pro: [
    "Everything in Growth",
    "Full CRM — 50,000 leads",
    "Auto AI replies (hands-free)",
    "Copilot — AI command center",
    "Weekly scorecards",
    "Agency mode (manage client orgs)",
    "5 seats",
    "20,000 AI replies/month",
    "Dedicated support + onboarding",
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
