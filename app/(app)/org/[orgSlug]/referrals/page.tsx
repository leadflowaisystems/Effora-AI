export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ReferralsView } from "@/components/referrals/referrals-view";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "Referrals — Effora AI" };

export default async function ReferralsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: orgRow } = await svc
    .from("orgs")
    .select("id, referral_code")
    .eq("slug", params.orgSlug)
    .single();

  if (!orgRow) notFound();
  const org = orgRow as { id: string; referral_code: string | null };

  // All orgs referred by this org's referral code
  const { data: referredOrgsData } = org.referral_code
    ? await svc
        .from("orgs")
        .select("id, name, plan, subscription_status, created_at")
        .eq("referred_by", org.referral_code)
        .order("created_at", { ascending: false })
    : { data: [] };

  type ReferredOrg = { id: string; name: string; plan: string; subscription_status: string; created_at: string };
  const referredOrgs = (referredOrgsData ?? []) as ReferredOrg[];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://Effora AI.in";

  return (
    <ReferralsView
      referralCode={org.referral_code ?? ""}
      referralUrl={`${appUrl}?ref=${org.referral_code ?? ""}`}
      referredOrgs={referredOrgs}
    />
  );
}
