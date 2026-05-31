/**
 * Inngest cron: aggregate-daily-metrics
 * Runs at 01:00 UTC every day.
 * Aggregates yesterday's data for ALL orgs into metrics_daily.
 *
 * Upserts one row per org per day so re-runs are safe.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export const aggregateDailyMetrics = inngest.createFunction(
  { id: "aggregate-daily-metrics", name: "Aggregate daily metrics", retries: 2 },
  { cron: "0 1 * * *" },
  async ({ step }) => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const dayStart = `${dateStr}T00:00:00.000Z`;
    const dayEnd   = `${dateStr}T23:59:59.999Z`;

    const orgs = await step.run("load-orgs", async () => {
      const svc = createServiceClient();
      const { data } = await svc.from("orgs").select("id");
      return (data ?? []) as { id: string }[];
    });

    // ── 1. Expire trials that ended before today ──────────────
    const expiredCount = await step.run("expire-trials", async () => {
      const svc = createServiceClient();
      const now = new Date().toISOString();
      const { data: expiring } = await svc
        .from("orgs")
        .select("id")
        .eq("plan", "trial")
        .lt("trial_ends_at", now);

      const ids = (expiring ?? []).map((o: { id: string }) => o.id);
      if (ids.length === 0) return 0;

      // Mark them as trial_expired (keep plan=trial so we know they had a trial;
      // the modal checks isTrialExpired which is date-based)
      // We just need to audit-log these for observability
      for (const id of ids) {
        await logAudit(svc, id, null, "billing.trial_expired", { expired_at: now });
      }
      return ids.length;
    });

    // ── 2. Convert past_due > 7 days to cancelled ─────────────
    const cancelledCount = await step.run("cancel-past-due", async () => {
      const svc = createServiceClient();
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: pastDue } = await svc
        .from("orgs")
        .select("id")
        .eq("subscription_status", "past_due")
        .lt("current_period_end", sevenDaysAgo);

      const ids = (pastDue ?? []).map((o: { id: string }) => o.id);
      if (ids.length === 0) return 0;

      await svc.from("orgs").update({
        plan:                "cancelled",
        subscription_status: "cancelled",
      }).in("id", ids);

      for (const id of ids) {
        await logAudit(svc, id, null, "billing.auto_cancelled", { reason: "past_due_7d" });
      }
      return ids.length;
    });

    // ── 3. Aggregate daily metrics ─────────────────────────────
    for (const org of orgs) {
      await step.run(`metrics-${org.id}-${dateStr}`, () =>
        aggregateOrg(org.id, dateStr, dayStart, dayEnd)
      );
    }

    return { date: dateStr, orgs: orgs.length, expiredTrials: expiredCount, autoCancelled: cancelledCount };
  }
);

async function aggregateOrg(
  orgId: string,
  dateStr: string,
  dayStart: string,
  dayEnd: string
) {
  const svc = createServiceClient();

  const [
    convRes, qualRes, bookedRes, showedRes, paidRes,
    pipeRes, outboundRes, sourceRes,
    dunningRes, revivalRes, noshowRes,
  ] = await Promise.all([
    // DMs received: new conversations that day
    svc.from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    // Qualified: leads with score >= 50 created that day
    svc.from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("score", 50)
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    // Booked: bookings confirmed that day
    svc.from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "confirmed")
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    // Showed: bookings completed that day
    svc.from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "completed")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    // Paid: payments captured that day + revenue
    svc.from("payments")
      .select("id, amount_inr, lead_id")
      .eq("org_id", orgId)
      .eq("status", "paid")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    // Pipeline: current pending
    svc.from("payments")
      .select("amount_inr")
      .eq("org_id", orgId)
      .eq("status", "pending"),

    // Outbound messages that day
    svc.from("messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("direction", "outbound")
      .gte("sent_at", dayStart).lte("sent_at", dayEnd),

    // Source breakdown: leads created that day with source
    svc.from("leads")
      .select("source, score")
      .eq("org_id", orgId)
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    // Dunning-recovered payments: paid today AND lead had a dunning sequence_run
    svc.from("payments")
      .select("amount_inr, lead_id")
      .eq("org_id", orgId)
      .eq("status", "paid")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd)
      .not("lead_id", "is", null),

    // Revival-recovered: paid today AND lead had a ghost_revival sequence_run
    svc.from("payments")
      .select("amount_inr, lead_id")
      .eq("org_id", orgId)
      .eq("status", "paid")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    // No-show recovery: leads with a no_show booking who then paid
    svc.from("bookings")
      .select("lead_id")
      .eq("org_id", orgId)
      .eq("status", "no_show"),
  ]);

  const paidRows    = (paidRes.data ?? []) as { id: string; amount_inr: number; lead_id: string }[];
  // De-duplicate: count unique leads who paid today, not payment row count
  const paidLeadIds = new Set(paidRows.map((r) => r.lead_id));

  // Attribution: check sequence_runs for paid leads
  let dunningInr = 0;
  let revivalInr = 0;
  let noshowInr  = 0;

  if (paidLeadIds.size > 0) {
    const paidLeadArr = Array.from(paidLeadIds);
    const [dunnSeq, revivalSeq] = await Promise.all([
      svc.from("sequence_runs")
        .select("lead_id")
        .eq("org_id", orgId)
        .eq("type", "dunning")
        .in("lead_id", paidLeadArr),
      svc.from("sequence_runs")
        .select("lead_id")
        .eq("org_id", orgId)
        .eq("type", "ghost_revival")
        .in("lead_id", paidLeadArr),
    ]);

    const dunningLeads  = new Set((dunnSeq.data ?? []).map((r) => (r as { lead_id: string }).lead_id));
    const revivalLeads  = new Set((revivalSeq.data ?? []).map((r) => (r as { lead_id: string }).lead_id));
    const noshowLeads   = new Set(
      ((noshowRes.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id)
    );

    for (const p of paidRows) {
      if (dunningLeads.has(p.lead_id))  dunningInr += p.amount_inr;
      if (revivalLeads.has(p.lead_id))  revivalInr += p.amount_inr;
      if (noshowLeads.has(p.lead_id))   noshowInr  += p.amount_inr;
    }
  }

  // Source breakdown
  const srcMap: Record<string, { leads: number; revenue_inr: number }> = {};
  for (const lead of (sourceRes.data ?? []) as { source: string | null; score: number }[]) {
    const src = lead.source ?? "organic";
    if (!srcMap[src]) srcMap[src] = { leads: 0, revenue_inr: 0 };
    srcMap[src].leads++;
  }
  // Attribute paid revenue to source (match paid lead_id → lead source)
  if (paidRows.length > 0) {
    const paidLeadArr = Array.from(paidLeadIds);
    const { data: leadSrcs } = await svc.from("leads")
      .select("id, source")
      .in("id", paidLeadArr);
    const leadSrcMap = Object.fromEntries(
      ((leadSrcs ?? []) as { id: string; source: string | null }[])
        .map((l) => [l.id, l.source ?? "organic"])
    );
    for (const p of paidRows) {
      const src = leadSrcMap[p.lead_id] ?? "organic";
      if (!srcMap[src]) srcMap[src] = { leads: 0, revenue_inr: 0 };
      srcMap[src].revenue_inr += p.amount_inr;
    }
  }

  const totalPaidInr = paidRows.reduce((s, r) => s + r.amount_inr, 0);
  const pipelineInr  = ((pipeRes.data ?? []) as { amount_inr: number }[])
    .reduce((s, r) => s + r.amount_inr, 0);

  const now = new Date().toISOString();

  await svc.from("metrics_daily").upsert({
    org_id:             orgId,
    date:               dateStr,
    dms_received:       convRes.count ?? 0,
    leads_qualified:    qualRes.count ?? 0,
    leads_booked:       bookedRes.count ?? 0,
    leads_showed:       showedRes.count ?? 0,
    leads_paid:         paidLeadIds.size, // unique leads, not payment event count
    revenue_paid_inr:   totalPaidInr,
    revenue_dunning_inr: dunningInr,
    revenue_revival_inr: revivalInr,
    revenue_noshow_inr:  noshowInr,
    pipeline_inr:        pipelineInr,
    speed_sum_ms:        0,   // computed separately if messages have timestamps
    speed_count:         0,
    messages_ai:         outboundRes.count ?? 0,
    tokens_used:         0,
    source_breakdown:    srcMap,
    updated_at:          now,
  }, { onConflict: "org_id,date" });
}
