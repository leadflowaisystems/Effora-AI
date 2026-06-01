/**
 * GET /api/orgs/[orgId]/dashboard?days=30
 *
 * Returns pre-aggregated dashboard data from metrics_daily.
 * Falls back to live raw-table counts when metrics_daily is empty
 * (so the dashboard is useful before the first cron run).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { cache } from "@/lib/cache";

interface Params { params: { orgId: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("org_members").select("role")
    .eq("org_id", params.orgId).eq("user_id", user.id).single();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId   = params.orgId;
  const days    = Math.min(parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10), 90);
  const cacheKey = `dashboard:${orgId}:${days}`;
  const cached   = await cache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  const svc   = createServiceClient();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // ── Load metrics_daily rows ──────────────────────────────────
  const { data: rows } = await svc
    .from("metrics_daily")
    .select("*")
    .eq("org_id", orgId)
    .gte("date", since)
    .order("date", { ascending: true });

  const metricRows = (rows ?? []) as MetricRow[];

  // ── If no pre-aggregated rows, compute live totals ───────────
  let liveFallback: LiveFallback | null = null;
  if (metricRows.length === 0) {
    liveFallback = await computeLive(orgId, svc, days);
  }

  // ── Aggregate totals from rows ───────────────────────────────
  const totals = metricRows.reduce(
    (acc, r) => {
      acc.dms_received    += r.dms_received;
      acc.leads_qualified += r.leads_qualified;
      acc.leads_booked    += r.leads_booked;
      acc.leads_showed    += r.leads_showed;
      acc.leads_paid      += r.leads_paid;
      acc.revenue_paid    += r.revenue_paid_inr;
      acc.revenue_dunning += r.revenue_dunning_inr;
      acc.revenue_revival += r.revenue_revival_inr;
      acc.revenue_noshow  += r.revenue_noshow_inr;
      acc.messages_ai     += r.messages_ai;
      acc.tokens_used     += r.tokens_used;
      return acc;
    },
    {
      dms_received: 0, leads_qualified: 0, leads_booked: 0,
      leads_showed: 0, leads_paid: 0,
      revenue_paid: 0, revenue_dunning: 0, revenue_revival: 0, revenue_noshow: 0,
      messages_ai: 0, tokens_used: 0,
    }
  );

  // Speed to lead (weighted average across days)
  const speedSum   = metricRows.reduce((s, r) => s + r.speed_sum_ms, 0);
  const speedCount = metricRows.reduce((s, r) => s + r.speed_count, 0);
  const speedMs    = speedCount > 0 ? Math.round(speedSum / speedCount) : null;

  // Current pipeline (latest day's snapshot)
  const latestRow  = metricRows[metricRows.length - 1];
  const pipelineInr = latestRow?.pipeline_inr ?? liveFallback?.pipeline_inr ?? 0;

  // Source breakdown: merge across days
  const sourceMap: Record<string, { leads: number; revenue_inr: number }> = {};
  for (const r of metricRows) {
    const bd = r.source_breakdown as Record<string, { leads: number; revenue_inr: number }> ?? {};
    for (const [src, v] of Object.entries(bd)) {
      if (!sourceMap[src]) sourceMap[src] = { leads: 0, revenue_inr: 0 };
      sourceMap[src].leads       += v.leads ?? 0;
      sourceMap[src].revenue_inr += v.revenue_inr ?? 0;
    }
  }

  const sources = Object.entries(sourceMap)
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.revenue_inr - a.revenue_inr)
    .slice(0, 8);

  // Sparkline: revenue per day over the range
  const sparkline = metricRows.map((r) => ({
    date:          r.date as string,
    revenue_inr:   r.revenue_paid_inr,
    dms:           r.dms_received,
    paid:          r.leads_paid,
  }));

  // When using the live fallback, messages_ai comes from the fallback query;
  // when using metrics_daily, it comes from aggregated totals.
  const messagesAi = liveFallback?.messages_ai ?? totals.messages_ai;
  const tokensUsed = totals.tokens_used; // only available in metrics_daily

  // AI cost estimate (₹ 0.012 per 1k tokens — rough Groq/OpenAI rate)
  const aiCostInr = Math.round((tokensUsed / 1000) * 0.012 * 84);

  const rawFunnel = liveFallback
    ? liveFallback.funnel
    : {
        dms:       totals.dms_received,
        qualified: totals.leads_qualified,
        booked:    totals.leads_booked,
        showed:    totals.leads_showed,
        // Use unique lead count from metrics_daily — each day's leads_paid
        // counts unique paying leads for that day, summing gives total distinct payers
        paid:      totals.leads_paid,
      };
  const funnel = clampFunnel(rawFunnel);

  // ── Dev parity assertion ─────────────────────────────────────
  // Warns when dashboard funnel.paid diverges from the raw payments table
  // by more than 1 (off-by-one is acceptable due to range boundaries).
  if (process.env.NODE_ENV !== "production") {
    const { count: rawPaidCount } = await svc
      .from("payments")
      .select("lead_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "paid")
      .gte("updated_at", `${since}T00:00:00.000Z`);
    if (rawPaidCount !== null && Math.abs(rawPaidCount - funnel.paid) > 1) {
      console.warn(
        `[dashboard/parity] funnel.paid=${funnel.paid} vs raw payments.paid=${rawPaidCount}` +
        ` for last ${days}d. Source: ${liveFallback ? "live" : "metrics_daily"}`
      );
    }
  }

  const responseData = {
    funnel,
    revenue: {
      paid:     liveFallback?.revenue_paid    ?? totals.revenue_paid,
      dunning:  liveFallback?.revenue_dunning ?? totals.revenue_dunning,
      revival:  liveFallback?.revenue_revival ?? totals.revenue_revival,
      noshow:   liveFallback?.revenue_noshow  ?? totals.revenue_noshow,
      pipeline: pipelineInr,
    },
    speed_ms: liveFallback?.speed_ms ?? speedMs,
    ai: {
      messages:  messagesAi,
      tokens:    tokensUsed,
      cost_inr:  aiCostInr,
    },
    sources,
    sparkline,
    days,
    is_live_fallback: !!liveFallback,
  };

  // Cache for 30s to avoid repeated DB hits on dashboard refresh
  await cache.set(cacheKey, responseData, 30);

  return NextResponse.json(responseData);
}

// ── Types ────────────────────────────────────────────────────

interface MetricRow {
  date: string;
  dms_received: number;
  leads_qualified: number;
  leads_booked: number;
  leads_showed: number;
  leads_paid: number;
  revenue_paid_inr: number;
  revenue_dunning_inr: number;
  revenue_revival_inr: number;
  revenue_noshow_inr: number;
  pipeline_inr: number;
  speed_sum_ms: number;
  speed_count: number;
  messages_ai: number;
  tokens_used: number;
  source_breakdown: unknown;
}

interface LiveFallback {
  funnel: { dms: number; qualified: number; booked: number; showed: number; paid: number };
  revenue_paid: number;
  revenue_dunning: number;
  revenue_revival: number;
  revenue_noshow: number;
  pipeline_inr: number;
  speed_ms: number | null;
  messages_ai: number;
}

// ── Funnel clamper ───────────────────────────────────────────
// Clamps dms→qualified→booked→showed to be monotone-decreasing.
// `paid` is intentionally NOT clamped by `showed` — revival leads
// and direct-pay leads close a deal without ever having a completed
// booking, so paid can legitimately exceed showed.
function clampFunnel(f: { dms: number; qualified: number; booked: number; showed: number; paid: number }) {
  const dms       = f.dms;
  const qualified = Math.min(f.qualified, dms);
  const booked    = Math.min(f.booked,    qualified);
  const showed    = Math.min(f.showed,    booked);
  const paid      = f.paid; // NOT clamped by showed
  return { dms, qualified, booked, showed, paid };
}

// ── Live fallback (used when no metrics_daily rows exist) ────

async function computeLive(
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  days: number
): Promise<LiveFallback> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [convR, qualR, bookedR, showedR, paidR, pipeR, noshowR, dunnR, revR, outboundR] =
    await Promise.all([
      svc.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).gte("created_at", since),
      svc.from("leads").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).gte("score", 50).gte("created_at", since),
      svc.from("bookings").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "confirmed").gte("created_at", since),
      svc.from("bookings").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "completed").gte("updated_at", since),
      // Select full rows so we can count unique leads and sum amounts
      svc.from("payments").select("id, amount_inr, lead_id")
        .eq("org_id", orgId).eq("status", "paid").gte("updated_at", since),
      svc.from("payments").select("amount_inr")
        .eq("org_id", orgId).eq("status", "pending"),
      svc.from("bookings").select("lead_id")
        .eq("org_id", orgId).eq("status", "no_show"),
      svc.from("sequence_runs").select("lead_id")
        .eq("org_id", orgId).eq("type", "dunning"),
      svc.from("sequence_runs").select("lead_id")
        .eq("org_id", orgId).eq("type", "ghost_revival"),
      // AI messages sent in range (for live-fallback AI panel)
      svc.from("messages").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("direction", "outbound").gte("sent_at", since),
    ]);

  const paidRows  = (paidR.data ?? []) as { amount_inr: number; lead_id: string }[];
  const totalPaid = paidRows.reduce((s: number, r) => s + r.amount_inr, 0);
  const pipeline  = ((pipeR.data ?? []) as { amount_inr: number }[])
    .reduce((s: number, r) => s + r.amount_inr, 0);

  const dunnLeads   = new Set(((dunnR.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id));
  const revLeads    = new Set(((revR.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id));
  const noshowLeads = new Set(((noshowR.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id));

  let dunning = 0, revival = 0, noshow = 0;
  for (const p of paidRows) {
    if (dunnLeads.has(p.lead_id))   dunning += p.amount_inr;
    if (revLeads.has(p.lead_id))    revival += p.amount_inr;
    if (noshowLeads.has(p.lead_id)) noshow  += p.amount_inr;
  }

  // Count UNIQUE leads who paid (not payment events — one lead may have multiple payments)
  const uniquePaidLeads = new Set(paidRows.map((r) => r.lead_id)).size;

  return {
    funnel: clampFunnel({
      dms:       convR.count   ?? 0,
      qualified: qualR.count   ?? 0,
      booked:    bookedR.count ?? 0,
      showed:    showedR.count ?? 0,
      paid:      uniquePaidLeads,
    }),
    revenue_paid:    totalPaid,
    revenue_dunning: dunning,
    revenue_revival: revival,
    revenue_noshow:  noshow,
    pipeline_inr:    pipeline,
    speed_ms:        null,
    messages_ai:     outboundR.count ?? 0,
  };
}
