import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { CoachView } from "@/components/coach/coach-view";
import { getAccessState } from "@/lib/access";

export async function generateMetadata() {
  return { title: "Accountability Coach — Effora AI" };
}

interface Props { params: { orgSlug: string } }

export default async function CoachPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase.from("orgs").select("id").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [access, svc] = [await getAccessState(org.id), createServiceClient() as any];

  const [goalsRes, commitsRes, scorecardsRes] = await Promise.all([
    svc.from("coach_goals").select("*").eq("org_id", org.id).eq("status", "active").order("created_at", { ascending: false }).limit(20),
    svc.from("coach_commitments").select("*").eq("org_id", org.id).order("due_date", { ascending: true }).limit(30),
    svc.from("coach_scorecards").select("*").eq("org_id", org.id).order("week_start", { ascending: false }).limit(8),
  ]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Accountability Coach</h1>
        <p className="text-sm text-[var(--text-3)]">Goals, commitments, weekly scorecard. Build the habit of winning.</p>
      </div>
      <CoachView
        orgId={org.id}
        orgSlug={params.orgSlug}
        canUse={access.canUseAccountability}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialGoals={(goalsRes.data ?? []) as any[]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialCommitments={(commitsRes.data ?? []) as any[]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialScorecards={(scorecardsRes.data ?? []) as any[]}
      />
    </div>
  );
}
