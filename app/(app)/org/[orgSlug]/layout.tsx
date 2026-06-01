import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { getPlanLimits } from "@/lib/plan";
import { AiUsageBanner } from "@/components/layout/ai-usage-banner";
import { AppShell } from "@/components/layout/app-shell";
import { TrialExpiredModal } from "@/components/layout/trial-expired-modal";
import { FirstRunOverlay } from "@/components/onboarding/first-run-overlay";
import { PushOptIn } from "@/components/push/push-opt-in";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { MilestoneBanner } from "@/components/rewards/milestone-banner";

interface Props {
  children: React.ReactNode;
  params: { orgSlug: string };
}

export default async function OrgLayout({ children, params }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify org exists and user is a member
  const { data: orgData } = await supabase
    .from("orgs")
    .select("id, slug, name, onboarding_completed_at, plan, trial_ends_at, subscription_status, monthly_ai_msg_count")
    .eq("slug", params.orgSlug)
    .single();

  const org = orgData as {
    id: string;
    slug: string;
    name: string;
    onboarding_completed_at: string | null;
    plan: string;
    trial_ends_at: string | null;
    subscription_status: string | null;
    monthly_ai_msg_count: number;
  } | null;

  if (!org) notFound();

  const { data: membershipData } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single();

  if (!membershipData) redirect("/onboarding");

  // Redirect to wizard if onboarding hasn't been completed.
  // Skip when already on the onboarding sub-path (avoids redirect loop).
  const pathname = headers().get("x-pathname") ?? "";
  const isOnboardingPath = pathname.includes("/onboarding");

  if (!org.onboarding_completed_at && !isOnboardingPath) {
    redirect(`/org/${params.orgSlug}/onboarding`);
  }

  // All orgs this user belongs to (for the org switcher)
  const { data: allMemberships } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id);

  const orgIds =
    (allMemberships as { org_id: string }[] | null)?.map((m) => m.org_id) ?? [];

  const { data: allOrgsData } = await supabase
    .from("orgs")
    .select("id, slug, name")
    .in("id", orgIds);

  const orgs =
    (allOrgsData as { id: string; slug: string; name: string }[] | null) ?? [];

  // Onboarding wizard uses fixed overlay — render children bare
  if (isOnboardingPath) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        {children}
      </div>
    );
  }

  return (
    <AppShell
      orgSlug={params.orgSlug}
      orgName={org.name}
      orgs={orgs}
      user={{ email: user.email ?? undefined }}
    >
      {/* Trial expired modal — client component, renders nothing if not expired */}
      <TrialExpiredModal
        plan={org.plan ?? "trial"}
        trialEndsAt={org.trial_ends_at ?? null}
        orgSlug={params.orgSlug}
        subStatus={org.subscription_status ?? undefined}
      />
      {/* First-run overlay — client component, auto-dismisses after localStorage flag is set */}
      <FirstRunOverlay orgSlug={params.orgSlug} orgId={org.id} />
      {/* AI usage banner — shown at 80%+ usage on every page */}
      <AiUsageBanner
        plan={org.plan ?? "trial"}
        aiMsgsUsed={org.monthly_ai_msg_count ?? 0}
        aiMsgsLimit={getPlanLimits(org.plan ?? "trial").aiMsgsPerMonth}
        orgSlug={params.orgSlug}
      />
      <MilestoneBanner orgId={org.id} />
      {/* Push notification opt-in — only shows if VAPID configured and permission not yet decided */}
      {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
        <PushOptIn orgId={org.id} orgSlug={params.orgSlug} vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
      )}
      {children}
      <CopilotPanel orgId={org.id} orgSlug={params.orgSlug} />
    </AppShell>
  );
}
