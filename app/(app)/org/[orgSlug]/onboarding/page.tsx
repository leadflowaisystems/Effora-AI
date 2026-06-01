export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { WizardClient } from "./wizard-client";

interface Props { params: { orgSlug: string } }

export async function generateMetadata({ params }: Props) {
  return { title: `Set up your workspace — Effora AI` };
}

export default async function OnboardingWizardPage({ params }: Props) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgData } = await supabase
    .from("orgs")
    .select("id, slug, name, active_channel, onboarding_completed_at")
    .eq("slug", params.orgSlug)
    .single();

  const org = orgData as {
    id: string;
    slug: string;
    name: string;
    active_channel: string;
    onboarding_completed_at: string | null;
  } | null;

  if (!org) notFound();

  // Already completed → skip to health
  if (org.onboarding_completed_at) {
    redirect(`/org/${params.orgSlug}/health`);
  }

  return (
    <WizardClient
      orgId={org.id}
      orgSlug={org.slug}
      orgName={org.name}
      userEmail={user.email ?? ""}
    />
  );
}
