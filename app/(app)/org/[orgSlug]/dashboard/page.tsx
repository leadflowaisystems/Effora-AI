export const dynamic = "force-dynamic";

/**
 * /org/[slug]/dashboard
 * Server component — loads pre-aggregated 30-day metrics, renders DashboardView.
 */

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DashboardView, type DashboardData } from "@/components/dashboard/dashboard-view";

function clampFunnel(f: { dms: number; qualified: number; booked: number; showed: number; paid: number }) {
  const dms       = f.dms;
  const qualified = Math.min(f.qualified, dms);
  const booked    = Math.min(f.booked,    qualified);
  const showed    = Math.min(f.showed,    booked);
  const paid      = f.paid; // NOT clamped by showed — revival/direct-pay leads bypass booking
  return { dms, qualified, booked, showed, paid };
}

interface Props {
  params: { orgSlug: string };
}

export async function generateMetadata() {
  return { title: "Dashboard — Effora AI" };
}

export default async function DashboardPage({ params }: Props) {
  // TODO (post-PMF, only build when 10+ customers ask):
  // - AI accountability coach with daily check-ins
  // - AI copilot chat panel
  // - Gamification / rewards system
  // - Structured context capture (intake forms)
  // - Trend analysis deep-dive charts

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id")
    .eq("slug", params.orgSlug).single();

  const org = orgRow as { id: string } | null;
  if (!org) redirect("/onboarding"); // new user — org not provisioned yet

  const svc   = createServiceClient();
  const orgId = org.id;
  const days  = 30;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // ── Load metrics_daily (fast path) ──────────────────────────
  const { data: rows } = await svc
    .from("metrics_daily")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", since)
    .order("date", { ascending: true });

  type MetricRow = {
    date: string;
    dms_received: number; leads_qualified: number; leads_booked: number;
    leads_showed: number; leads_paid: number;
    revenue_paid_inr: number; revenue_dunning_inr: number;
    revenue_revival_inr: number; revenue_noshow_inr: number;
    pipeline_inr: number;
    speed_sum_ms: number; speed_count: number;
    messages_ai: number; tokens_used: number;
    source_breakdown: unknown;
  };

  const metricRows = (rows ?? []) as MetricRow[];

  // ── Live fallback when no rows exist ────────────────────────
  let dashData: DashboardData;

  if (metricRows.length === 0) {
    // compute live from raw tables — guarded by 8s timeout so mobile never hangs
    const sinceFull = new Date(Date.now() - days * 86400000).toISOString();
    const timeout8s = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));

    const liveResult = await Promise.race([
      Promise.all([
        svc.from("conversations").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).gte("created_at", sinceFull),
        svc.from("leads").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).gte("score", 50).gte("created_at", sinceFull),
        svc.from("bookings").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).eq("status", "confirmed").gte("created_at", sinceFull),
        svc.from("bookings").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).eq("status", "completed").gte("updated_at", sinceFull),
        svc.from("payments").select("id, amount_inr, lead_id")
          .eq("org_id", orgId).eq("status", "paid").gte("updated_at", sinceFull),
        svc.from("payments").select("amount_inr")
          .eq("org_id", orgId).eq("status", "pending"),
        svc.from("bookings").select("lead_id")
          .eq("org_id", orgId).eq("status", "no_show"),
        svc.from("sequence_runs").select("lead_id")
          .eq("org_id", orgId).eq("type", "dunning"),
        svc.from("sequence_runs").select("lead_id")
          .eq("org_id", orgId).eq("type", "ghost_revival"),
        svc.from("leads").select("id, source").eq("org_id", orgId)
          .gte("created_at", sinceFull),
      ]),
      timeout8s,
    ]);

    // Timeout hit — render with empty/zero state rather than blocking forever
    if (!liveResult) {
      console.warn("[dashboard] live-fallback queries timed out — returning empty state");
      dashData = {
        funnel: { dms: 0, qualified: 0, booked: 0, showed: 0, paid: 0 },
        revenue: { paid: 0, dunning: 0, revival: 0, noshow: 0, pipeline: 0 },
        speed_ms: null, ai: { messages: 0, tokens: 0, cost_inr: 0 },
        sources: [], sparkline: [], days, is_live_fallback: true,
      };
    } else {
    const [convR, qualR, bookedR, showedR, paidR, pipeR, noshowR, dunnR, revR, srcR] = liveResult;

    const paidRows  = (paidR.data ?? []) as { amount_inr: number; lead_id: string }[];
    const totalPaid = paidRows.reduce((s, r) => s + r.amount_inr, 0);
    const pipeline  = ((pipeR.data ?? []) as { amount_inr: number }[])
      .reduce((s, r) => s + r.amount_inr, 0);

    const dunnLeads   = new Set(((dunnR.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id));
    const revLeads    = new Set(((revR.data  ?? []) as { lead_id: string }[]).map((r) => r.lead_id));
    const noshowLeads = new Set(((noshowR.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id));
    const srcLeads    = (srcR.data ?? []) as { id: string; source: string | null }[];
    const leadSrcMap  = Object.fromEntries(srcLeads.map((l) => [l.id, l.source ?? "organic"]));

    let dunning = 0, revival = 0, noshow = 0;
    const srcMap: Record<string, { leads: number; revenue_inr: number }> = {};
    for (const l of srcLeads) {
      const s = l.source ?? "organic";
      if (!srcMap[s]) srcMap[s] = { leads: 0, revenue_inr: 0 };
      srcMap[s].leads++;
    }
    for (const p of paidRows) {
      if (dunnLeads.has(p.lead_id))   dunning += p.amount_inr;
      if (revLeads.has(p.lead_id))    revival += p.amount_inr;
      if (noshowLeads.has(p.lead_id)) noshow  += p.amount_inr;
      const s = leadSrcMap[p.lead_id] ?? "organic";
      if (!srcMap[s]) srcMap[s] = { leads: 0, revenue_inr: 0 };
      srcMap[s].revenue_inr += p.amount_inr;
    }

    dashData = {
      funnel: clampFunnel({
        dms:       convR.count   ?? 0,
        qualified: qualR.count   ?? 0,
        booked:    bookedR.count ?? 0,
        showed:    showedR.count ?? 0,
        // Unique leads who paid — de-duplicate in case a lead has multiple payment rows
        paid:      new Set(paidRows.map((p) => p.lead_id)).size,
      }),
      revenue: {
        paid:     totalPaid,
        dunning,
        revival,
        noshow,
        pipeline,
      },
      speed_ms:   null,
      ai: { messages: 0, tokens: 0, cost_inr: 0 },
      sources: Object.entries(srcMap)
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.revenue_inr - a.revenue_inr)
        .slice(0, 8),
      sparkline: [],
      days,
      is_live_fallback: true,
    };
    } // end liveResult else
  } else {
    // Aggregate from metrics_daily rows
    const totals = metricRows.reduce(
      (acc, r) => {
        acc.dms          += r.dms_received;
        acc.qualified    += r.leads_qualified;
        acc.booked       += r.leads_booked;
        acc.showed       += r.leads_showed;
        acc.paid         += r.leads_paid;
        acc.revPaid      += r.revenue_paid_inr;
        acc.revDunning   += r.revenue_dunning_inr;
        acc.revRevival   += r.revenue_revival_inr;
        acc.revNoshow    += r.revenue_noshow_inr;
        acc.speedSum     += r.speed_sum_ms;
        acc.speedCount   += r.speed_count;
        acc.messages     += r.messages_ai;
        acc.tokens       += r.tokens_used;
        return acc;
      },
      { dms:0, qualified:0, booked:0, showed:0, paid:0,
        revPaid:0, revDunning:0, revRevival:0, revNoshow:0,
        speedSum:0, speedCount:0, messages:0, tokens:0 }
    );

    const pipeline  = metricRows[metricRows.length - 1]?.pipeline_inr ?? 0;
    const speedMs   = totals.speedCount > 0
      ? Math.round(totals.speedSum / totals.speedCount) : null;
    const aiCostInr = Math.round((totals.tokens / 1000) * 0.012 * 84);

    // Merge source_breakdown across days
    const srcMap: Record<string, { leads: number; revenue_inr: number }> = {};
    for (const r of metricRows) {
      const bd = (r.source_breakdown ?? {}) as Record<string, { leads: number; revenue_inr: number }>;
      for (const [src, v] of Object.entries(bd)) {
        if (!srcMap[src]) srcMap[src] = { leads: 0, revenue_inr: 0 };
        srcMap[src].leads       += v.leads ?? 0;
        srcMap[src].revenue_inr += v.revenue_inr ?? 0;
      }
    }

    dashData = {
      funnel: clampFunnel({
        dms: totals.dms, qualified: totals.qualified,
        booked: totals.booked, showed: totals.showed, paid: totals.paid,
      }),
      revenue: {
        paid: totals.revPaid, dunning: totals.revDunning,
        revival: totals.revRevival, noshow: totals.revNoshow, pipeline,
      },
      speed_ms:   speedMs,
      ai: { messages: totals.messages, tokens: totals.tokens, cost_inr: aiCostInr },
      sources: Object.entries(srcMap)
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.revenue_inr - a.revenue_inr)
        .slice(0, 8),
      sparkline: metricRows.map((r) => ({
        date:        r.date,
        revenue_inr: r.revenue_paid_inr,
        dms:         r.dms_received,
        paid:        r.leads_paid,
      })),
      days,
      is_live_fallback: false,
    };
  }

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Dashboard</h1>
        <p className="text-sm text-[var(--text-3)]">
          Your full funnel, recovered revenue, and AI attribution — all in one view.
        </p>
      </div>

      <DashboardView initialData={dashData} orgId={orgId} isDev={isDev} />
    </div>
  );
}
