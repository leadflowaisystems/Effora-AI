/**
 * lib/access.ts — single source of truth for org feature access.
 *
 * Call getAccessState(orgId) from any server context. The return value
 * drives every gate: AI replies, channel connections, agency features,
 * screenshot OCR, funnel pages, WhatsApp.
 *
 * Designed to be cacheable (60s Upstash TTL in lib/cache.ts) so per-request
 * DB cost is minimal for high-traffic orgs.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { getPlanLimits }       from "@/lib/plan";
import { cache }               from "@/lib/cache";

export interface AccessState {
  status:                    "trial_active" | "trial_expired" | "subscribed" | "cancelled" | "past_due";
  plan:                      "trial" | "starter" | "growth" | "pro" | null;
  trialDaysLeft:             number | null;
  canSendAi:                 boolean;
  canUseAgency:              boolean;
  canProcessScreenshot:      boolean;   // All paid plans + trial; false only on expired/cancelled
  canCreateFunnelPages:      number;    // 1 / 3 / -1 unlimited
  canUseWhatsApp:            boolean;   // Free feature on all plans
  canConnectChannels:        number;    // -1 = unlimited
  canUseAssistant3Reply:     boolean;
  canUseCRM:                 number;    // max leads, -1 = unlimited
  canUseManualBookingPayment: boolean;
  canUseUpiPayments:         boolean;
  canUseEmail:               boolean;
  canUseRevival:             boolean;
  canUseCopilot:             boolean;
  canUseAccountability:      boolean;
  canUseTrends:              boolean;
  canUseDeepContext:         boolean;
  canUseRewards:             boolean;
  copilotDailyLimit:         number;  // -1 = unlimited
  aiMsgsUsedThisMonth:       number;
  aiMsgsLimit:               number;    // -1 = unlimited
  reason?:                   "trial_expired" | "limit_reached" | "cancelled" | "past_due";
}

type OrgRow = {
  plan:                 string;
  trial_ends_at:        string | null;
  subscription_status:  string;
  monthly_ai_msg_count: number;
  ai_msgs_reset_at:     string;
};

function buildState(org: OrgRow): AccessState {
  const now          = new Date();
  const plan         = org.plan as string;
  const subStatus    = org.subscription_status;
  const trialEndsAt  = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const trialExpired = plan === "trial" && !!trialEndsAt && trialEndsAt < now;
  const trialDaysLeft = (plan === "trial" && trialEndsAt && !trialExpired)
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000))
    : null;

  let status: AccessState["status"];
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

  let canSendAi                  = false;
  let canUseAgency               = false;
  let canConnectChannels         = 0;
  let canProcessScreenshot       = false;
  let canCreateFunnelPages       = 0;
  let canUseAssistant3Reply      = false;
  let canUseCRM                  = 0;
  let canUseManualBookingPayment = false;
  let canUseUpiPayments          = false;
  let canUseEmail                = false;
  let canUseRevival              = false;
  let canUseCopilot              = false;
  let canUseAccountability       = false;
  let canUseTrends               = false;
  let canUseDeepContext          = false;
  let canUseRewards              = false;
  let copilotDailyLimit          = 0;
  const canUseWhatsApp           = true; // free feature on all plans
  let reason: AccessState["reason"];

  switch (status) {
    case "trial_active":
      canSendAi                  = org.monthly_ai_msg_count < 2000;
      canUseAgency               = false;
      canConnectChannels         = 2;
      canProcessScreenshot       = true;
      canCreateFunnelPages       = 3;
      canUseAssistant3Reply      = true;
      canUseCRM                  = 2000;
      canUseManualBookingPayment = true;
      canUseUpiPayments          = true;
      canUseEmail                = true;
      canUseRevival              = true;
      canUseCopilot              = true;
      copilotDailyLimit          = 60;
      canUseAccountability       = true;
      canUseTrends               = false;
      canUseDeepContext          = true;
      canUseRewards              = true;
      if (!canSendAi) reason = "limit_reached";
      break;

    case "trial_expired":
      canSendAi                  = false;
      canConnectChannels         = 0;
      canProcessScreenshot       = false;
      canCreateFunnelPages       = 0;
      canUseAssistant3Reply      = false;
      canUseCRM                  = 0;
      canUseManualBookingPayment = false;
      canUseUpiPayments          = false;
      canUseEmail                = false;
      canUseRevival              = false;
      canUseCopilot              = false;
      copilotDailyLimit          = 0;
      canUseAccountability       = false;
      canUseTrends               = false;
      canUseDeepContext          = false;
      canUseRewards              = false;
      reason                     = "trial_expired";
      break;

    case "subscribed":
      canSendAi = limits.aiMsgsPerMonth === -1
        ? true
        : org.monthly_ai_msg_count < limits.aiMsgsPerMonth;
      canUseAgency               = plan === "pro";
      canConnectChannels         = limits.channelsAllowed;
      canProcessScreenshot       = true;
      canUseAssistant3Reply      = true;
      canUseManualBookingPayment = true;
      canUseUpiPayments          = true;
      canUseEmail                = true;
      if (plan === "starter") {
        canCreateFunnelPages = 1;
        canUseCRM            = 200;
        canUseRevival        = false;
        canUseCopilot        = true;
        copilotDailyLimit    = 60;
        canUseAccountability = false;
        canUseTrends         = false;
        canUseDeepContext    = true;
        canUseRewards        = true;
      } else if (plan === "growth") {
        canCreateFunnelPages = 3;
        canUseCRM            = 2000;
        canUseRevival        = true;
        canUseCopilot        = true;
        copilotDailyLimit    = 300;
        canUseAccountability = true;
        canUseTrends         = false;
        canUseDeepContext    = true;
        canUseRewards        = true;
      } else {
        // pro
        canCreateFunnelPages = -1;
        canUseCRM            = -1;
        canUseRevival        = true;
        canUseCopilot        = true;
        copilotDailyLimit    = -1;
        canUseAccountability = true;
        canUseTrends         = true;
        canUseDeepContext    = true;
        canUseRewards        = true;
      }
      if (!canSendAi) reason = "limit_reached";
      break;

    case "cancelled":
      canSendAi                  = false;
      canConnectChannels         = 1;
      canProcessScreenshot       = false;
      canCreateFunnelPages       = 0;
      canUseAssistant3Reply      = false;
      canUseCRM                  = 0;
      canUseManualBookingPayment = false;
      canUseUpiPayments          = false;
      canUseEmail                = false;
      canUseRevival              = false;
      canUseCopilot              = false;
      copilotDailyLimit          = 0;
      canUseAccountability       = false;
      canUseTrends               = false;
      canUseDeepContext          = false;
      canUseRewards              = false;
      reason                     = "cancelled";
      break;

    case "past_due":
      canSendAi                  = false;
      canConnectChannels         = limits.channelsAllowed;
      canProcessScreenshot       = false;
      canCreateFunnelPages       = 0;
      canUseAssistant3Reply      = false;
      canUseCRM                  = 0;
      canUseManualBookingPayment = false;
      canUseUpiPayments          = false;
      canUseEmail                = false;
      canUseRevival              = false;
      canUseCopilot              = false;
      copilotDailyLimit          = 0;
      canUseAccountability       = false;
      canUseTrends               = false;
      canUseDeepContext          = false;
      canUseRewards              = false;
      reason                     = "past_due";
      break;
  }

  return {
    status,
    plan:                      (plan ?? null) as AccessState["plan"],
    trialDaysLeft,
    canSendAi,
    canUseAgency,
    canProcessScreenshot,
    canCreateFunnelPages,
    canUseWhatsApp,
    canConnectChannels,
    canUseAssistant3Reply,
    canUseCRM,
    canUseManualBookingPayment,
    canUseUpiPayments,
    canUseEmail,
    canUseRevival,
    canUseCopilot,
    canUseAccountability,
    canUseTrends,
    canUseDeepContext,
    canUseRewards,
    copilotDailyLimit,
    aiMsgsUsedThisMonth: org.monthly_ai_msg_count,
    aiMsgsLimit:         status === "trial_active" ? 2000 : limits.aiMsgsPerMonth,
    reason,
  };
}

export async function getAccessState(orgId: string): Promise<AccessState> {
  // Check 60-second cache first (Upstash when configured, in-memory fallback)
  const cached = await cache.get<AccessState>(`access:${orgId}`);
  if (cached) return cached;

  const svc = createServiceClient();
  const { data } = await svc
    .from("orgs")
    .select("plan, trial_ends_at, subscription_status, monthly_ai_msg_count, ai_msgs_reset_at")
    .eq("id", orgId)
    .single();

  if (!data) {
    return {
      status:                    "cancelled",
      plan:                      null,
      trialDaysLeft:             null,
      canSendAi:                 false,
      canUseAgency:              false,
      canProcessScreenshot:      false,
      canCreateFunnelPages:      0,
      canUseWhatsApp:            false,
      canConnectChannels:        0,
      canUseAssistant3Reply:     false,
      canUseCRM:                 0,
      canUseManualBookingPayment: false,
      canUseUpiPayments:         false,
      canUseEmail:               false,
      canUseRevival:             false,
      canUseCopilot:             false,
      canUseAccountability:      false,
      canUseTrends:              false,
      canUseDeepContext:         false,
      canUseRewards:             false,
      copilotDailyLimit:         0,
      aiMsgsUsedThisMonth:       0,
      aiMsgsLimit:               0,
      reason:                    "cancelled",
    };
  }

  const state = buildState(data as OrgRow);
  await cache.set(`access:${orgId}`, state, 60);
  return state;
}

/** Call this whenever the org's plan/status changes so stale cache is evicted. */
export async function invalidateAccessCache(orgId: string): Promise<void> {
  await cache.del(`access:${orgId}`);
}

export async function canOrgSendAi(orgId: string): Promise<boolean> {
  const state = await getAccessState(orgId);
  return state.canSendAi;
}
