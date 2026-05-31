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
    id: string;
    plan: string;
    trial_ends_at: string;
    subscription_status: string;
    current_period_end: string | null;
    monthly_ai_msg_count: number;
  };

  return (
    <BillingView
      orgId={org.id}
      plan={org.plan}
      trialEndsAt={org.trial_ends_at}
      subscriptionStatus={org.subscription_status}
      currentPeriodEnd={org.current_period_end}
      monthlyAiMsgCount={org.monthly_ai_msg_count}
    />
  );
}
