export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreateOrgForm } from "@/components/org/create-org-form";

export const metadata = { title: "Create your workspace — Effora AI" };

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // If they already have an org, skip onboarding
  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1);

  const orgId = (memberships as { org_id: string }[] | null)?.[0]?.org_id;

  if (orgId) {
    const { data: org } = await supabase
      .from("orgs")
      .select("slug")
      .eq("id", orgId)
      .single();

    const slug = (org as { slug: string } | null)?.slug;
    if (slug) redirect(`/org/${slug}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Create your workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            You are in. Now let&apos;s set up your coaching business.
          </p>
        </div>
        <CreateOrgForm />
      </div>
    </main>
  );
}
