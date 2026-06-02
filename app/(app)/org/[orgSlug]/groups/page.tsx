export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GroupsView } from "@/components/groups/groups-view";

interface Props { params: { orgSlug: string } }

export async function generateMetadata() {
  return { title: "Groups — Effora AI" };
}

export default async function GroupsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase.from("orgs").select("id, plan").eq("slug", params.orgSlug).single();
  if (!orgRow) redirect("/onboarding");
  const org = orgRow as { id: string; plan: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data: groups } = await svc
    .from("lead_groups")
    .select("id, name, tag, channel, description, created_at")
    .eq("org_id", org.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // For each group, get member count
  const groupIds = (groups ?? []).map((g: { id: string }) => g.id);
  const memberCounts: Record<string, number> = {};
  if (groupIds.length > 0) {
    const { data: counts } = await svc.from("lead_group_members")
      .select("group_id")
      .in("group_id", groupIds);
    for (const row of (counts ?? []) as Array<{ group_id: string }>) {
      memberCounts[row.group_id] = (memberCounts[row.group_id] ?? 0) + 1;
    }
  }

  const groupsWithCounts = (groups ?? []).map((g: Record<string, unknown>) => ({
    ...g,
    member_count: memberCounts[g.id as string] ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Groups</h1>
        <p className="text-sm text-[var(--text-3)]">Save segments of leads and send them personalized messages as a group.</p>
      </div>
      <GroupsView
        orgId={org.id}
        orgSlug={params.orgSlug}
        initialGroups={groupsWithCounts}
        plan={org.plan}
      />
    </div>
  );
}
