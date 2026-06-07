/**
 * /org/[slug] — Effora AI Home
 * Quiet Money Terminal home screen. All data server-fetched; animations are
 * purely presentational (no layout shift).
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Zap, MessageSquare, IndianRupee, TrendingUp } from "lucide-react";
import { HomeClient } from "@/components/home/home-client";
import { getPlanLimits } from "@/lib/plan";

interface Props { params: { orgSlug: string } }

const MOTIVATIONAL_LINES = [
  "23% of coaches lost a lead today to slow replies. Not you.",
  "Your AI is qualifying leads while you coach, sleep, and live.",
  "Speed to lead is the only metric that pays the rent.",
  "Every unanswered DM is a lead that went to a faster coach.",
  "The reply you don't send is the client you don't close.",
  "Coaches who respond in under 5 minutes close 3× more deals.",
  "Your pipeline runs 24/7. So does your AI.",
];

function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export const dynamic = "force-dynamic";

export default async function OrgHomePage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs")
    .select("id, name, plan, trial_ends_at, monthly_ai_msg_count")
    .eq("slug", params.orgSlug)
    .single();

  // If org doesn't exist (new user whose org wasn't provisioned yet),
  // send to onboarding instead of 404 to avoid infinite loading.
  if (!orgRow) redirect("/onboarding");
  const org = orgRow as {
    id: string; name: string; plan: string;
    trial_ends_at: string | null; monthly_ai_msg_count: number;
  };

  const svc = createServiceClient();

  // ── Data fetches in parallel ────────────────────────────────
  const sevenDaysAgo   = new Date(Date.now() - 7  * 86400000).toISOString();
  const thirtyDaysAgo  = new Date(Date.now() - 30 * 86400000).toISOString();
  const monthStart     = new Date().toISOString().slice(0, 7) + "-01";

  // Race all 12 parallel queries against an 8-second timeout.
  // On slow mobile connections, a timeout returns null and we render with
  // zero/empty metrics rather than blocking the page indefinitely.
  const homeTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));

  const homeResult = await Promise.race([
    Promise.all([
    // Leads this week
    svc.from("leads").select("id", { count: "exact", head: true })
      .eq("org_id", org.id).gte("created_at", sevenDaysAgo),

    // AI msgs this month (from ai_usage)
    svc.from("ai_usage").select("tokens_in, tokens_out")
      .eq("org_id", org.id).eq("month", monthStart).maybeSingle(),

    // Revenue this month (payments captured)
    svc.from("payments").select("amount_inr")
      .eq("org_id", org.id).eq("status", "paid").gte("updated_at", monthStart),

    // Integrations status
    svc.from("integrations").select("provider, active").eq("org_id", org.id),

    // Voice profile
    svc.from("voice_profiles").select("id").eq("org_id", org.id).maybeSingle(),

    // Recent leads (last 8, for activity)
    svc.from("leads").select("id, name, stage, source, created_at")
      .eq("org_id", org.id).order("created_at", { ascending: false }).limit(8),

    // Recent bookings
    svc.from("bookings").select("id, status, created_at")
      .eq("org_id", org.id).order("created_at", { ascending: false }).limit(4),

    // Recent payments
    svc.from("payments").select("id, amount_inr, status, updated_at")
      .eq("org_id", org.id).order("updated_at", { ascending: false }).limit(4),

    // Recent AI outbound messages
    svc.from("messages").select("id, sent_at")
      .eq("org_id", org.id).eq("direction", "outbound")
      .order("sent_at", { ascending: false }).limit(4),

    // Sparkline: leads per day last 7
    svc.from("leads").select("created_at").eq("org_id", org.id).gte("created_at", sevenDaysAgo),

    // Sparkline: AI msgs from metrics_daily
    svc.from("metrics_daily").select("date, messages_ai")
      .eq("org_id", org.id).gte("date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
      .order("date"),

    // Sparkline: revenue
    svc.from("metrics_daily").select("date, revenue_paid_inr")
      .eq("org_id", org.id).gte("date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
      .order("date"),
    ]),
    homeTimeout,
  ]);

  // Zero-state defaults used on timeout or query failure
  const EMPTY_RES = { data: [], count: 0, error: null };
  const [
    leadsWeekRes   = EMPTY_RES,
    aiUsageRes     = EMPTY_RES,
    revenueMonthRes = EMPTY_RES,
    integrationsRes = EMPTY_RES,
    voiceRes        = EMPTY_RES,
    recentLeadsRes  = EMPTY_RES,
    recentBookingsRes = EMPTY_RES,
    recentPaymentsRes = EMPTY_RES,
    recentMsgsRes   = EMPTY_RES,
    sparkLeadsRes   = EMPTY_RES,
    sparkAiRes      = EMPTY_RES,
    sparkRevRes     = EMPTY_RES,
  ] = homeResult ?? [];

  if (!homeResult) console.warn("[org-home] parallel queries timed out — rendering empty state");

  // ── Process metrics ─────────────────────────────────────────
  const leadsThisWeek = leadsWeekRes.count ?? 0;

  const aiMsgCount = org.monthly_ai_msg_count ?? 0;

  const revenueThisMonth = ((revenueMonthRes.data ?? []) as { amount_inr: number }[])
    .reduce((s, r) => s + r.amount_inr, 0);

  // Sparklines (7 buckets)
  function buildDailySparkline(rows: { created_at?: string }[], field = "created_at"): number[] {
    const buckets: number[] = Array(7).fill(0);
    for (const row of rows) {
      const ts = (row as Record<string, string>)[field];
      if (!ts) continue;
      const daysBack = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
      const idx = 6 - Math.min(daysBack, 6);
      buckets[idx]++;
    }
    return buckets;
  }

  const sparkLeads = buildDailySparkline(sparkLeadsRes.data ?? []);
  const sparkAi = ((sparkAiRes.data ?? []) as { messages_ai: number }[]).map((r) => r.messages_ai);
  const sparkRev = ((sparkRevRes.data ?? []) as { revenue_paid_inr: number }[]).map((r) => r.revenue_paid_inr);
  // Pad to 7
  while (sparkAi.length < 7) sparkAi.unshift(0);
  while (sparkRev.length < 7) sparkRev.unshift(0);

  const metrics = [
    {
      label:     "Leads this week",
      value:     leadsThisWeek,
      sparkline: sparkLeads,
      icon:      <TrendingUp className="h-4 w-4" />,
    },
    {
      label:     "AI replies this month",
      value:     aiMsgCount,
      sparkline: sparkAi.length > 0 ? sparkAi : Array(7).fill(0),
      icon:      <Zap className="h-4 w-4" />,
    },
    {
      label:     "Revenue this month",
      value:     Math.round(revenueThisMonth),
      prefix:    "₹",
      sparkline: sparkRev.length > 0 ? sparkRev : Array(7).fill(0),
      icon:      <IndianRupee className="h-4 w-4" />,
    },
    {
      label:     "Msgs sent (30d)",
      value:     (recentMsgsRes.data?.length ?? 0) > 0 ? (recentMsgsRes.data?.length ?? 0) : 0,
      sparkline: Array(7).fill(0),
      icon:      <MessageSquare className="h-4 w-4" />,
    },
  ];

  // ── Checklist ───────────────────────────────────────────────
  const integrations = (integrationsRes.data ?? []) as { provider: string; active: boolean }[];
  const hasCalcom   = integrations.some((i) => i.provider === "calcom"   && i.active);
  const hasRazorpay = integrations.some((i) => i.provider === "razorpay" && i.active);
  const hasChannel  = integrations.some((i) =>
    // meta_instagram = Instagram connected via Meta App (new flow)
    // whatsapp_cloud = WhatsApp Cloud API connected
    // instagram / manychat = legacy provider names
    (
      i.provider === "instagram"      ||
      i.provider === "meta_instagram" ||
      i.provider === "manychat"       ||
      i.provider === "whatsapp_cloud"
    ) && i.active
  );
  const hasVoice    = !!voiceRes.data;

  const checklist = [
    {
      key:     "channel",
      label:   "Connect a channel",
      done:    hasChannel,
      href:    `/org/${params.orgSlug}/settings/channel`,
      caption: "Receive live DMs from Instagram or ManyChat",
    },
    {
      key:     "cal",
      label:   "Add your Cal.com link",
      done:    hasCalcom,
      href:    `/org/${params.orgSlug}/settings/cal`,
      caption: "Let hot leads book calls straight from a reply",
    },
    {
      key:     "razorpay",
      label:   "Connect Razorpay",
      done:    hasRazorpay,
      href:    `/org/${params.orgSlug}/settings/payments`,
      caption: "Track collections and run payment dunning",
    },
    {
      key:     "voice",
      label:   "Set your voice profile",
      done:    hasVoice,
      href:    `/org/${params.orgSlug}/settings/voice`,
      caption: "Train the AI to reply exactly like you",
    },
  ];
  const allChecklistDone = checklist.every((c) => c.done);

  // ── Activity feed ───────────────────────────────────────────
  type ActivityRaw = { id: string; text: string; icon: string; iconColor: string; ts: string };
  const activityRaw: ActivityRaw[] = [];

  for (const lead of (recentLeadsRes.data ?? []) as { id: string; name: string | null; stage: string; created_at: string }[]) {
    const name = lead.name ?? "Unknown";
    if (lead.stage === "hot") {
      activityRaw.push({ id: `lead-hot-${lead.id}`, text: `${name} scored Hot`, icon: "🔥", iconColor: "bg-red-500/10 text-red-400", ts: lead.created_at });
    } else {
      activityRaw.push({ id: `lead-${lead.id}`, text: `${name} sent a new DM`, icon: "💬", iconColor: "bg-[var(--bg-3)] text-[var(--text-3)]", ts: lead.created_at });
    }
  }

  for (const bk of (recentBookingsRes.data ?? []) as { id: string; status: string; created_at: string }[]) {
    const icon   = bk.status === "completed" ? "✅" : bk.status === "no_show" ? "❌" : "📅";
    const color  = bk.status === "completed" ? "bg-[var(--brand)]/10 text-[var(--brand)]"
                 : bk.status === "no_show"   ? "bg-red-500/10 text-red-400"
                 : "bg-blue-500/10 text-blue-400";
    const label  = bk.status === "completed" ? "A call was completed"
                 : bk.status === "no_show"   ? "A call was a no-show"
                 : "A booking was confirmed";
    activityRaw.push({ id: `bk-${bk.id}`, text: label, icon, iconColor: color, ts: bk.created_at });
  }

  for (const pay of (revenueMonthRes.data ?? []).slice(0, 3) as { amount_inr: number }[]) {
    // payments don't have created_at easily accessible here, use approx
    activityRaw.push({
      id:        `pay-${Math.random()}`,
      text:      `Payment of ₹${pay.amount_inr.toLocaleString("en-IN")} captured`,
      icon:      "💰",
      iconColor: "bg-green-500/10 text-green-400",
      ts:        new Date(Date.now() - 60000).toISOString(),
    });
  }

  // Sort all activity by ts desc, take 8
  activityRaw.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const activity = activityRaw.slice(0, 8).map((a) => ({
    id:        a.id,
    icon:      a.icon,
    iconColor: a.iconColor,
    text:      a.text,
    timeAgo:   timeAgo(a.ts),
  }));

  // ── User name ───────────────────────────────────────────────
  // Priority: full_name from auth metadata → org name
  // NEVER fall back to the email prefix (it looks like "0mnaarkar2673")
  const rawFullName =
    ((user.user_metadata?.full_name as string | undefined) ?? "").trim() ||
    ((user.user_metadata?.name      as string | undefined) ?? "").trim();
  const displayName = rawFullName
    ? (() => {
        const first = rawFullName.split(/\s+/)[0];
        return first.charAt(0).toUpperCase() + first.slice(1);
      })()
    : org.name;

  // ── Motivational line ───────────────────────────────────────
  const motivationalLine = MOTIVATIONAL_LINES[getDayOfYear() % MOTIVATIONAL_LINES.length];

  return (
    <HomeClient
      userName={displayName}
      orgName={org.name}
      orgSlug={params.orgSlug}
      orgId={org.id}
      plan={org.plan ?? "trial"}
      trialEndsAt={org.trial_ends_at ?? null}
      greeting={greeting()}
      metrics={metrics}
      checklist={checklist}
      activity={activity}
      motivationalLine={motivationalLine}
      isPro={org.plan === "pro"}
      allChecklistDone={allChecklistDone}
    />
  );
}
