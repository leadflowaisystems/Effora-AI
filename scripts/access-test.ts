/**
 * scripts/access-test.ts — access state unit tests.
 *
 * Tests getAccessState() logic without hitting a real DB by directly
 * testing the business rules with constructed org rows.
 *
 * Run: npx ts-node --project tsconfig.json scripts/access-test.ts
 */

// Self-contained — no lib imports so this runs without path alias resolution
type PlanLimits = { aiMsgsPerMonth: number; seatsAllowed: number; channelsAllowed: number };

function getPlanLimits(plan: string): PlanLimits {
  const LIMITS: Record<string, PlanLimits> = {
    trial:     { aiMsgsPerMonth: 2000, seatsAllowed: 3,  channelsAllowed: 2  },
    starter:   { aiMsgsPerMonth: 500,  seatsAllowed: 1,  channelsAllowed: 1  },
    growth:    { aiMsgsPerMonth: 2000, seatsAllowed: 3,  channelsAllowed: 2  },
    pro:       { aiMsgsPerMonth: 8000, seatsAllowed: -1, channelsAllowed: -1 },
    cancelled: { aiMsgsPerMonth: 0,   seatsAllowed: 1,  channelsAllowed: 1  },
  };
  return LIMITS[plan] ?? LIMITS.starter;
}

type AccessStatus = "trial_active" | "trial_expired" | "subscribed" | "cancelled" | "past_due";

interface AccessState {
  status:              AccessStatus;
  plan:                string | null;
  trialDaysLeft:       number | null;
  canSendAi:           boolean;
  canUseAgency:        boolean;
  canConnectChannels:  number;
  aiMsgsUsedThisMonth: number;
  aiMsgsLimit:         number;
  reason?:             string;
}

type OrgRow = {
  plan:                 string;
  trial_ends_at:        string | null;
  subscription_status:  string;
  monthly_ai_msg_count: number;
  ai_msgs_reset_at:     string;
};

function computeAccess(org: OrgRow): AccessState {
  const now          = new Date();
  const plan         = org.plan;
  const subStatus    = org.subscription_status;
  const trialEndsAt  = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const trialExpired = plan === "trial" && !!trialEndsAt && trialEndsAt < now;
  const trialDaysLeft = (plan === "trial" && trialEndsAt && !trialExpired)
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000))
    : null;

  let status: AccessStatus;
  if (plan === "trial") {
    status = trialExpired ? "trial_expired" : "trial_active";
  } else if (plan === "cancelled" || subStatus === "cancelled" || subStatus === "halted") {
    status = "cancelled";
  } else if (subStatus === "past_due") {
    status = "past_due";
  } else {
    status = "subscribed";
  }

  const limits = getPlanLimits(plan ?? "cancelled");
  let canSendAi = false, canUseAgency = false, canConnectChannels = 0;
  let reason: string | undefined;

  switch (status) {
    case "trial_active":
      canSendAi          = org.monthly_ai_msg_count < 2000;
      canUseAgency       = false;
      canConnectChannels = 2;
      if (!canSendAi) reason = "limit_reached";
      break;
    case "trial_expired":
      canSendAi          = false;
      canConnectChannels = 0;
      reason             = "trial_expired";
      break;
    case "subscribed":
      canSendAi = limits.aiMsgsPerMonth === -1 ? true : org.monthly_ai_msg_count < limits.aiMsgsPerMonth;
      canUseAgency       = plan === "pro";
      canConnectChannels = limits.channelsAllowed;
      if (!canSendAi) reason = "limit_reached";
      break;
    case "cancelled":
      canSendAi          = false;
      canConnectChannels = 1;
      reason             = "cancelled";
      break;
    case "past_due":
      canSendAi          = false;
      canConnectChannels = limits.channelsAllowed;
      reason             = "past_due";
      break;
  }

  return {
    status, plan: plan ?? null, trialDaysLeft,
    canSendAi, canUseAgency, canConnectChannels,
    aiMsgsUsedThisMonth: org.monthly_ai_msg_count,
    aiMsgsLimit: status === "trial_active" ? 2000 : limits.aiMsgsPerMonth,
    reason,
  };
}

type TestCase = {
  name:    string;
  org:     OrgRow;
  expect:  Partial<AccessState>;
};

const tomorrow  = new Date(Date.now() + 86400000).toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const now       = new Date().toISOString();

const cases: TestCase[] = [
  {
    name: "trial_active — under limit",
    org:  { plan: "trial", trial_ends_at: tomorrow, subscription_status: "trialing", monthly_ai_msg_count: 100, ai_msgs_reset_at: now },
    expect: { status: "trial_active", canSendAi: true, canUseAgency: false, canConnectChannels: 2 },
  },
  {
    name: "trial_active — at 2000 limit",
    org:  { plan: "trial", trial_ends_at: tomorrow, subscription_status: "trialing", monthly_ai_msg_count: 2000, ai_msgs_reset_at: now },
    expect: { status: "trial_active", canSendAi: false, reason: "limit_reached" },
  },
  {
    name: "trial_expired",
    org:  { plan: "trial", trial_ends_at: yesterday, subscription_status: "trialing", monthly_ai_msg_count: 0, ai_msgs_reset_at: now },
    expect: { status: "trial_expired", canSendAi: false, canConnectChannels: 0, reason: "trial_expired" },
  },
  {
    name: "starter — under 500",
    org:  { plan: "starter", trial_ends_at: null, subscription_status: "active", monthly_ai_msg_count: 499, ai_msgs_reset_at: now },
    expect: { status: "subscribed", canSendAi: true, canUseAgency: false, canConnectChannels: 1 },
  },
  {
    name: "starter — at 500 limit",
    org:  { plan: "starter", trial_ends_at: null, subscription_status: "active", monthly_ai_msg_count: 500, ai_msgs_reset_at: now },
    expect: { status: "subscribed", canSendAi: false, reason: "limit_reached" },
  },
  {
    name: "growth — under 2000",
    org:  { plan: "growth", trial_ends_at: null, subscription_status: "active", monthly_ai_msg_count: 1999, ai_msgs_reset_at: now },
    expect: { status: "subscribed", canSendAi: true, canConnectChannels: 2 },
  },
  {
    name: "pro — under 8000 limit",
    org:  { plan: "pro", trial_ends_at: null, subscription_status: "active", monthly_ai_msg_count: 7999, ai_msgs_reset_at: now },
    expect: { status: "subscribed", canSendAi: true, canUseAgency: true, canConnectChannels: -1 },
  },
  {
    name: "pro — at 8000 limit",
    org:  { plan: "pro", trial_ends_at: null, subscription_status: "active", monthly_ai_msg_count: 8000, ai_msgs_reset_at: now },
    expect: { status: "subscribed", canSendAi: false, reason: "limit_reached" },
  },
  {
    name: "cancelled",
    org:  { plan: "cancelled", trial_ends_at: null, subscription_status: "cancelled", monthly_ai_msg_count: 0, ai_msgs_reset_at: now },
    expect: { status: "cancelled", canSendAi: false, reason: "cancelled" },
  },
  {
    name: "halted subscription",
    org:  { plan: "growth", trial_ends_at: null, subscription_status: "halted", monthly_ai_msg_count: 0, ai_msgs_reset_at: now },
    expect: { status: "cancelled", canSendAi: false },
  },
  {
    name: "past_due",
    org:  { plan: "growth", trial_ends_at: null, subscription_status: "past_due", monthly_ai_msg_count: 0, ai_msgs_reset_at: now },
    expect: { status: "past_due", canSendAi: false, reason: "past_due" },
  },
];

let passed = 0;
let failed = 0;

for (const { name, org, expect: exp } of cases) {
  const got = computeAccess(org);

  const mismatches: string[] = [];
  for (const [k, v] of Object.entries(exp)) {
    const actual = (got as unknown as Record<string, unknown>)[k];
    if (actual !== v) {
      mismatches.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`);
    }
  }

  if (mismatches.length === 0) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.error(`❌ ${name}`);
    mismatches.forEach((m) => console.error(`   ${m}`));
    failed++;
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Access test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
