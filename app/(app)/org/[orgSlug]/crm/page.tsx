import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { CrmView } from "@/components/crm/crm-view";

export async function generateMetadata() {
  return { title: "CRM — Effora AI" };
}

interface Props { params: { orgSlug: string } }

export default async function CrmPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string };

  // Initial load — client fetches more with pagination
  const svc = createServiceClient();
  const { data: leads } = await svc
    .from("leads")
    .select("id, name, external_id, channel, score, stage, tags, notes, ltv_inr, last_seen_at, created_at, source")
    .eq("org_id", org.id)
    .is("deleted_at", null)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(50);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">CRM</h1>
        <p className="text-sm text-[var(--text-3)]">Every lead in one place. Filter, tag, and track your pipeline.</p>
      </div>
      <CrmView
        orgId={org.id}
        orgSlug={params.orgSlug}
        initialLeads={(leads ?? []) as unknown as Parameters<typeof CrmView>[0]["initialLeads"]}
      />
    </div>
  );
}
