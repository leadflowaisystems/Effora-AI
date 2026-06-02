export const dynamic = "force-dynamic";

/**
 * /org/[orgSlug]/leads — Lead Detail section landing page.
 *
 * Shows a typeahead search selector. Once the user selects a lead the
 * router navigates to /org/[orgSlug]/leads/[leadId], which renders the
 * full lead profile with the same selector at the top.
 */

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { LeadsLanding } from "@/components/leads/leads-landing";

interface Props {
  params: { orgSlug: string };
}

export async function generateMetadata() {
  return { title: "Leads — Effora AI" };
}

export default async function LeadsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id").eq("slug", params.orgSlug).single();
  if (!orgRow) redirect("/onboarding");
  const org = orgRow as { id: string };

  return (
    <LeadsLanding
      orgId={org.id}
      orgSlug={params.orgSlug}
    />
  );
}
