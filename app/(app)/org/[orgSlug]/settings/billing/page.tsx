export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { BillingView } from "@/components/settings/billing-view";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "Billing — Effora AI" };

export default async function BillingPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: orgRow } = await svc
    .from("orgs")
    .select("id, plan, trial_ends_at, subscription_status, current_period_end, monthly_ai_msg_count")
    .eq("slug", params.orgSlug)
    .single();

  if (!orgRow) notFound();

  const org = orgRow as {
    id: string; plan: string; trial_ends_at: string;
    subscription_status: string; current_period_end: string | null;
    monthly_ai_msg_count: number;
  };

  // Fetch usage counts in parallel
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = svc as any;

  const [leadsCountRes, groupsCountRes, membersCountRes, broadcastsCountRes] = await Promise.all([
    svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("deleted_at", null),
    svcAny.from("lead_groups").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("deleted_at", null),
    svcAny.from("lead_group_members").select("lead_id", { count: "exact", head: true })
      .in("group_id", (await svcAny.from("lead_groups").select("id").eq("org_id", org.id).is("deleted_at", null)).data?.map((g: { id: string }) => g.id) ?? []),
    svcAny.from("broadcasts").select("id", { count: "exact", head: true })
      .eq("org_id", org.id).gte("created_at", monthStart.toISOString()),
  ]);

  return (
    <BillingView
      orgId={org.id}
      plan={org.plan}
      trialEndsAt={org.trial_ends_at}
      subscriptionStatus={org.subscription_status}
      currentPeriodEnd={org.current_period_end}
      monthlyAiMsgCount={org.monthly_ai_msg_count}
      usageCounts={{
        leads:      leadsCountRes.count      ?? 0,
        groups:     groupsCountRes.count     ?? 0,
        members:    membersCountRes.count    ?? 0,
        broadcasts: broadcastsCountRes.count ?? 0,
      }}
    />
  );
}
