/**
 * Inngest cron: 1st of every month at 00:05 UTC.
 * Resets monthly_ai_msg_count for all active orgs and invalidates access caches.
 * Note: lib/ai.ts also auto-resets per-org on first AI call of the month,
 * so this cron is a belt-and-suspenders safeguard for orgs that don't send AI
 * messages near the reset date.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { invalidateAccessCache } from "@/lib/access";

export const onMonthlyReset = inngest.createFunction(
  { id: "on-monthly-reset", name: "Monthly: reset AI message counters", retries: 1 },
  { cron: "5 0 1 * *" }, // 1st of month, 00:05 UTC
  async ({ step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc    = createServiceClient() as any;
    const now    = new Date().toISOString();
    const resetAt = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const { data: orgs } = await svc
      .from("orgs")
      .select("id")
      .not("plan", "in", '("cancelled","trial_expired")');

    const orgList = (orgs ?? []) as { id: string }[];

    // Reset in batches of 50
    const batchSize = 50;
    for (let i = 0; i < orgList.length; i += batchSize) {
      const batch = orgList.slice(i, i + batchSize);
      await step.run(`reset-batch-${i}`, async () => {
        const ids = batch.map((o) => o.id);
        await svc.from("orgs")
          .update({ monthly_ai_msg_count: 0, ai_msgs_reset_at: resetAt, updated_at: now })
          .in("id", ids);
        // Invalidate access cache for each
        await Promise.all(ids.map((id) => invalidateAccessCache(id).catch(() => null)));
      });
    }

    return { reset: orgList.length };
  }
);
