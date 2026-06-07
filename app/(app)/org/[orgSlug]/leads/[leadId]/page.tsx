export const dynamic = "force-dynamic";

/**
 * /org/[orgSlug]/leads/[leadId] — comprehensive lead profile page.
 * Server component that prefetches lead data and hands off to LeadDetail client.
 */

import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { LeadDetail } from "@/components/leads/lead-detail";

interface Props {
  params: { orgSlug: string; leadId: string };
}

export async function generateMetadata({ params }: Props) {
  return { title: `Lead — Effora AI` };
}

export default async function LeadDetailPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const [leadRes, convsRes, bookingsRes, paymentsRes, leadEventsRes] = await Promise.all([
    svc.from("leads")
       .select("id,name,external_id,channel,score,stage,tags,notes,ltv_inr,last_seen_at,created_at,source,avatar_url,metadata")
       .eq("id", params.leadId).eq("org_id", org.id).single(),
    svc.from("conversations")
       .select("id,channel_provider,last_message_at,last_message_preview,created_at")
       .eq("org_id", org.id).eq("lead_id", params.leadId)
       .order("last_message_at", { ascending: false }),
    svc.from("bookings")
       .select("id,status,starts_at,ends_at,meeting_url,attendee_name,attendee_email,recovery_attempt,created_at,deleted_at")
       .eq("org_id", org.id).eq("lead_id", params.leadId)
       // Note: intentionally NOT filtering by deleted_at here so that
       // soft-deleted (archived) bookings still appear in the lead history timeline.
       // Hard-deleted bookings are gone from the DB entirely (correct behaviour).
       .order("starts_at", { ascending: false }),
    svc.from("payments")
       .select("id,amount_inr,status,payment_link_url,notes,created_at,updated_at,deleted_at")
       .eq("org_id", org.id).eq("lead_id", params.leadId)
       .order("created_at", { ascending: false }),
    svc.from("lead_events")
       .select("id,event_type,entity_type,entity_id,title,metadata,created_at")
       .eq("org_id", org.id).eq("lead_id", params.leadId)
       .is("deleted_at", null)
       .order("created_at", { ascending: false })
       .limit(100),
  ]);

  if (!leadRes.data) notFound();

  return (
    <LeadDetail
      lead={leadRes.data}
      conversations={convsRes.data  ?? []}
      bookings={bookingsRes.data    ?? []}
      payments={paymentsRes.data    ?? []}
      leadEvents={leadEventsRes.data ?? []}
      orgId={org.id}
      orgSlug={params.orgSlug}
    />
  );
}
