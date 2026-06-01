/**
 * Inngest cron: weekly coach scorecard every Sunday at 8 PM UTC.
 * Scores each org 0-100 based on commitments, revenue, leads, bookings.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";

export const onWeeklyScorecard = inngest.createFunction(
  { id: "on-weekly-scorecard", name: "Weekly: generate coach scorecard", retries: 0 },
  { cron: "0 20 * * 0" }, // Sunday 8 PM UTC
  async ({ step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartStr  = weekStart.toISOString().slice(0, 10);
    const weekStartFull = weekStart.toISOString();

    const { data: orgs } = await svc
      .from("orgs")
      .select("id")
      .not("plan", "in", '("cancelled")');

    let generated = 0;

    for (const org of (orgs ?? []) as { id: string }[]) {
      await step.run(`scorecard-${org.id}`, async () => {
        const [commitsRes, bookingsRes, paymentsRes, leadsRes] = await Promise.all([
          svc.from("coach_commitments").select("status").eq("org_id", org.id).gte("due_date", weekStartStr),
          svc.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", org.id).gte("created_at", weekStartFull),
          svc.from("payments").select("amount_inr").eq("org_id", org.id).eq("status", "paid").gte("updated_at", weekStartFull),
          svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", org.id).gte("created_at", weekStartFull),
        ]);

        const commits      = (commitsRes.data ?? []) as { status: string }[];
        const done         = commits.filter((c) => c.status === "done").length;
        const total        = commits.length;
        const commitScore  = total > 0 ? Math.round((done / total) * 40) : 20;

        const revenue      = ((paymentsRes.data ?? []) as { amount_inr: number }[]).reduce((s, r) => s + r.amount_inr, 0);
        const revenueScore = Math.min(30, Math.round((revenue / 50000) * 30));
        const leadScore    = Math.min(20, (leadsRes.count ?? 0) * 2);
        const bookingScore = Math.min(10, (bookingsRes.count ?? 0) * 2);

        const score    = commitScore + revenueScore + leadScore + bookingScore;
        const metrics  = {
          commits_done:  done,
          commits_total: total,
          revenue_inr:   revenue,
          leads:         leadsRes.count  ?? 0,
          bookings:      bookingsRes.count ?? 0,
        };
        const insights = score >= 70
          ? "Solid week. Keep the commitment cadence going."
          : score >= 40
          ? "Decent week but room to improve. Focus on converting warm leads."
          : "Tough week. Pick one commitment to complete first thing Monday.";

        await svc.from("coach_scorecards").upsert(
          {
            org_id:      org.id,
            week_start:  weekStartStr,
            score,
            metrics_json: metrics,
            ai_insights:  insights,
            created_at:   new Date().toISOString(),
          },
          { onConflict: "org_id,week_start" }
        );
        generated++;
      });
    }

    return { generated };
  }
);
