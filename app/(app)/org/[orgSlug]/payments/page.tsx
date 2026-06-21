export const dynamic = "force-dynamic";

/**
 * /org/[slug]/payments
 * Server component — loads payments + leads, renders PaymentsView.
 * Passes isDev so the client can show/hide the Simulate payment tool.
 */

import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PaymentsView } from "@/components/payments/payments-view";
import type { PaymentRow, PaymentLead } from "@/components/payments/payment-card";
import type { SimulateLead } from "@/components/payments/simulate-payment-sheet";
import type { PaymentMode } from "@/app/(app)/org/[orgSlug]/settings/payments/payment-mode-form-client";

interface Props {
  params: { orgSlug: string };
}

export async function generateMetadata() {
  return { title: "Payments — Effora AI" };
}

export default async function PaymentsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs")
    .select("id, payment_mode")
    .eq("slug", params.orgSlug)
    .single();

  const org = orgRow as { id: string; payment_mode: string | null } | null;
  if (!org) notFound();

  const svc = createServiceClient();

  // Fetch payments + leads + groups in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = svc as any;
  const [paymentRes, leadRes, groupRes] = await Promise.all([
    svc
      .from("payments")
      .select(`
        id, status, amount_inr,
        payment_link_url, payment_link_id,
        conversation_id, notes,
        created_at, updated_at,
        lead:leads(id, name, avatar_url, stage, channel)
      `)
      .eq("org_id", org.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    svc
      .from("leads")
      .select("id, name, channel")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(100),
    svcAny
      .from("lead_groups")
      .select("id, name, tag")
      .eq("org_id", org.id)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const payments: PaymentRow[] = (paymentRes.data ?? []).map((r) => ({
    id:               r.id,
    status:           r.status as PaymentRow["status"],
    amount_inr:       r.amount_inr,
    payment_link_url: r.payment_link_url,
    payment_link_id:  r.payment_link_id,
    conversation_id:  r.conversation_id,
    notes:            r.notes,
    created_at:       r.created_at,
    updated_at:       r.updated_at,
    lead: (() => {
      const l = (r.lead as unknown) as {
        id: string; name: string | null; avatar_url: string | null;
        stage: string; channel: string;
      } | null;
      return l as PaymentLead | null;
    })(),
  }));

  const leads: SimulateLead[] = (leadRes.data ?? []).map((l) => ({
    id:      l.id,
    name:    l.name,
    channel: l.channel,
  }));

  // Enrich groups with member counts
  const rawGroups = (groupRes?.data ?? []) as Array<{ id: string; name: string; tag: string }>;
  const groupIds  = rawGroups.map((g) => g.id);
  const memberCounts: Record<string, number> = {};
  if (groupIds.length > 0) {
    const { data: mc } = await svcAny.from("lead_group_members").select("group_id")
      .in("group_id", groupIds);
    for (const row of (mc ?? []) as Array<{ group_id: string }>) {
      memberCounts[row.group_id] = (memberCounts[row.group_id] ?? 0) + 1;
    }
  }
  const paymentGroups = rawGroups.map((g) => ({
    id: g.id, name: g.name, tag: g.tag,
    channel: "both" as const,
    member_count: memberCounts[g.id] ?? 0,
  }));

  // Pre-derive pending payments for the simulate picker
  const pendingPayments = payments
    .filter((p) => p.status === "pending")
    .map((p) => ({
      id:         p.id,
      amount_inr: p.amount_inr,
      lead_name:  p.lead?.name ?? null,
    }));

  // Count unique leads who have at least one captured payment — same definition as dashboard hero.
  const totalPaid = new Set(
    payments
      .filter((p) => p.status === "paid" && p.lead)
      .map((p) => p.lead!.id)
  ).size;
  const totalPending = payments.filter((p) => p.status === "pending").length;

  const isDev = process.env.NODE_ENV !== "production";
  const paymentMode = (org.payment_mode ?? "both") as PaymentMode;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Payments</h1>
          {totalPending > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/25 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              {totalPending} pending
            </span>
          )}
          {totalPaid > 0 && (
            <span className="inline-flex items-center rounded-full bg-[var(--brand)]/10 border border-[var(--brand)]/20 px-2.5 py-0.5 text-xs font-medium text-[var(--brand)]">
              {totalPaid} paid
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--text-3)]">
          Payment links, capture status, and automated dunning — all in one place.
        </p>
      </div>

      <PaymentsView
        initialPayments={payments}
        orgId={org.id}
        orgSlug={params.orgSlug}
        isDev={isDev}
        leads={leads}
        groups={paymentGroups}
        pendingPayments={pendingPayments}
        paymentMode={paymentMode}
      />
    </div>
  );
}
