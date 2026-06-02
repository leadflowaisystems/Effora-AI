export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { GroupDetailView } from "@/components/groups/group-detail-view";

interface Props { params: { orgSlug: string; groupId: string } }

export async function generateMetadata({ params }: Props) {
  return { title: `Group — Effora AI` };
}

export default async function GroupDetailPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase.from("orgs").select("id, plan").eq("slug", params.orgSlug).single();
  if (!orgRow) redirect("/onboarding");
  const org = orgRow as { id: string; plan: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const { data: group } = await svc.from("lead_groups").select("*")
    .eq("id", params.groupId).eq("org_id", org.id).is("deleted_at", null).single();
  if (!group) notFound();

  const [membersRes, broadcastsRes] = await Promise.all([
    svc.from("lead_group_members")
      .select("lead_id, added_at, lead:lead_id(id, name, external_id, channel, stage, score, phone, instagram_handle, metadata)")
      .eq("group_id", params.groupId)
      .order("added_at", { ascending: false })
      .limit(200),
    svc.from("broadcasts")
      .select("id, channel, message_template, status, created_at, total_recipients, sent_count, failed_count")
      .eq("group_id", params.groupId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Load WA templates for compose
  const { data: waTemplates } = await svc.from("whatsapp_templates")
    .select("id, name, body, variables, approval_status")
    .eq("org_id", org.id).eq("approval_status", "approved");

  return (
    <GroupDetailView
      orgId={org.id}
      orgSlug={params.orgSlug}
      group={group}
      initialMembers={membersRes.data ?? []}
      initialBroadcasts={broadcastsRes.data ?? []}
      waTemplates={waTemplates ?? []}
    />
  );
}
