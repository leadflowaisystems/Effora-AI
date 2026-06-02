export const dynamic = "force-dynamic";

/**
 * /org/[slug]/bookings
 * Server component — loads bookings + leads, renders BookingsView.
 * Passes isDev so the client can show/hide the Simulate booking tool.
 */

import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BookingsView } from "@/components/bookings/bookings-view";
import type { BookingRow, BookingLead } from "@/components/bookings/booking-card";
import type { SimulateLead } from "@/components/bookings/simulate-booking-sheet";

interface Props {
  params: { orgSlug: string };
}

export async function generateMetadata() {
  return { title: "Bookings — Effora AI" };
}

export default async function BookingsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs")
    .select("id")
    .eq("slug", params.orgSlug)
    .single();

  const org = orgRow as { id: string } | null;
  if (!org) notFound();

  const svc = createServiceClient();

  // Fetch bookings + leads + groups in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bookingRes, leadRes, groupRes] = await Promise.all([
    svc
      .from("bookings")
      .select(`
        id, status, starts_at, ends_at, meeting_url,
        attendee_name, attendee_email, cal_booking_uid,
        conversation_id, recovery_attempt, recovery_sent_at,
        created_at, updated_at,
        lead:leads(id, name, avatar_url, stage, channel)
      `)
      .eq("org_id", org.id)
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(100),
    svc
      .from("leads")
      .select("id, name, channel")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(100),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any)
      .from("lead_groups")
      .select("id, name, tag")
      .eq("org_id", org.id)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const bookings: BookingRow[] = (bookingRes.data ?? []).map((r) => ({
    id:               r.id,
    status:           r.status as BookingRow["status"],
    starts_at:        r.starts_at,
    ends_at:          r.ends_at,
    meeting_url:      r.meeting_url,
    attendee_name:    r.attendee_name,
    attendee_email:   r.attendee_email,
    cal_booking_uid:  r.cal_booking_uid,
    conversation_id:  r.conversation_id,
    recovery_attempt: r.recovery_attempt ?? 0,
    recovery_sent_at: r.recovery_sent_at,
    created_at:       r.created_at,
    lead: (() => {
      const l = (r.lead as unknown) as {
        id: string; name: string | null; avatar_url: string | null;
        stage: string; channel: string;
      } | null;
      return l as BookingLead | null;
    })(),
  }));

  const leads: SimulateLead[] = (leadRes.data ?? []).map((l) => ({
    id:      l.id,
    name:    l.name,
    channel: l.channel,
  }));

  // Get member counts for groups
  const rawGroups = (groupRes?.data ?? []) as Array<{ id: string; name: string; tag: string }>;
  const groupIds  = rawGroups.map((g) => g.id);
  const memberCounts: Record<string, number> = {};
  if (groupIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mc } = await (svc as any).from("lead_group_members").select("group_id")
      .in("group_id", groupIds);
    for (const row of (mc ?? []) as Array<{ group_id: string }>) {
      memberCounts[row.group_id] = (memberCounts[row.group_id] ?? 0) + 1;
    }
  }
  const bookingGroups = rawGroups.map((g) => ({ ...g, member_count: memberCounts[g.id] ?? 0 }));

  const totalUpcoming = bookings.filter(
    (b) => b.status === "confirmed" && b.starts_at && new Date(b.starts_at) > new Date()
  ).length;

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Bookings</h1>
          {totalUpcoming > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              {totalUpcoming} upcoming
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--text-3)]">
          Discovery calls, reminders, and no-show recovery — all automated.
        </p>
      </div>

      <BookingsView
        initialBookings={bookings}
        orgSlug={params.orgSlug}
        orgId={org.id}
        isDev={isDev}
        leads={leads}
        groups={bookingGroups}
      />
    </div>
  );
}
