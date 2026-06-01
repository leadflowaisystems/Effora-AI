export const dynamic = "force-dynamic";

/**
 * /org/[slug]/sequences
 * Server component — loads sequence runs + inactive leads, renders SequencesView.
 */

import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { SequencesView, type InactiveLead } from "@/components/sequences/sequences-view";
import type { SequenceRun, SequenceLead } from "@/components/sequences/sequence-card";

interface Props {
  params: { orgSlug: string };
}

export async function generateMetadata() {
  return { title: "Sequences — Effora AI" };
}

const INACTIVE_DAYS = parseInt(process.env.REVIVAL_INACTIVE_DAYS ?? "14", 10);

export default async function SequencesPage({ params }: Props) {
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

  const [runRes, inactiveRes] = await Promise.all([
    svc
      .from("sequence_runs")
      .select(`
        id, type, status, step_current, step_total, metadata,
        started_at, updated_at, stopped_at,
        lead:leads(id, name, avatar_url, stage, channel)
      `)
      .eq("org_id", org.id)
      .order("started_at", { ascending: false })
      .limit(60),

    svc
      .from("leads")
      .select("id, name, avatar_url, stage, channel, last_seen_at, score")
      .eq("org_id", org.id)
      .lt("last_seen_at", new Date(Date.now() - INACTIVE_DAYS * 86400000).toISOString())
      .not("stage", "in", '("booked","booking_sent","qualified","won","paid","churned")')
      .order("last_seen_at", { ascending: true })
      .limit(30),
  ]);

  // Filter out inactive leads that already have an active revival
  const activeRevivalLeadIds = new Set(
    (runRes.data ?? [])
      .filter((r) => r.type === "ghost_revival" && r.status === "active")
      .map((r) => {
        const l = (r.lead as unknown) as { id: string } | null;
        return l?.id;
      })
      .filter(Boolean) as string[]
  );

  const runs: SequenceRun[] = (runRes.data ?? []).map((r) => ({
    id:           r.id,
    type:         r.type as SequenceRun["type"],
    status:       r.status as SequenceRun["status"],
    step_current: r.step_current,
    step_total:   r.step_total,
    metadata:     (r.metadata ?? {}) as Record<string, unknown>,
    started_at:   r.started_at,
    updated_at:   r.updated_at,
    stopped_at:   r.stopped_at,
    lead: (() => {
      const l = (r.lead as unknown) as {
        id: string; name: string | null; avatar_url: string | null;
        stage: string; channel: string;
      } | null;
      return l as SequenceLead | null;
    })(),
  }));

  const inactiveLeads: InactiveLead[] = (inactiveRes.data ?? [])
    .filter((l) => !activeRevivalLeadIds.has(l.id))
    .map((l) => ({
      id:           l.id,
      name:         l.name,
      avatar_url:   l.avatar_url,
      stage:        l.stage,
      channel:      l.channel,
      last_seen_at: l.last_seen_at,
      score:        l.score,
    }));

  const activeCount = runs.filter((r) => r.status === "active" || r.status === "flagged").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Sequences</h1>
          {activeCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-[var(--brand)]/10 border border-[var(--brand)]/20 px-2.5 py-0.5 text-xs font-medium text-[var(--brand)]">
              {activeCount} active
            </span>
          )}
          {inactiveLeads.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-violet-500/10 border border-violet-500/20 px-2.5 py-0.5 text-xs font-medium text-violet-400">
              {inactiveLeads.length} revival candidate{inactiveLeads.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--text-3)]">
          Dunning follow-ups and ghost revival nudges — automated, stoppable any time.
        </p>
      </div>

      <SequencesView
        initialRuns={runs}
        initialInactiveLeads={inactiveLeads}
        inactiveDaysThreshold={INACTIVE_DAYS}
        orgId={org.id}
      />
    </div>
  );
}
