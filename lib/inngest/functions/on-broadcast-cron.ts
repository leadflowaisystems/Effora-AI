/**
 * Inngest cron: broadcast/cron.process
 *
 * Runs every minute. Picks up any broadcasts that are still in "queued" state
 * with send_at <= NOW() and fires a broadcast.queued event for each one.
 *
 * This is the fallback for any broadcasts whose initial event was dropped
 * (e.g., cold-start, Inngest outage, or scheduled sends whose time has arrived).
 */

import { inngest }             from "../client";
import { createServiceClient } from "@/lib/supabase/server";

export const onBroadcastCron = inngest.createFunction(
  {
    id:      "on-broadcast-cron",
    name:    "Broadcast cron: pick up queued broadcasts",
    retries: 0,
  },
  { cron: "* * * * *" }, // every minute
  async ({ step }) => {
    const due = await step.run("find-due-broadcasts", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = createServiceClient() as any;
      const { data } = await svc
        .from("broadcasts")
        .select("id, org_id")
        .eq("status", "queued")
        .lte("send_at", new Date().toISOString())
        .limit(20); // safety cap: max 20 per tick to avoid thundering herd
      return (data ?? []) as Array<{ id: string; org_id: string }>;
    });

    if (due.length === 0) return { fired: 0 };

    // Fire one broadcast.queued event per pending broadcast.
    // The on-broadcast-process function is throttled per org_id
    // so concurrent fires are safe.
    await step.run("fire-broadcast-events", async () => {
      await inngest.send(
        due.map((b) => ({
          name: "broadcast.queued" as const,
          data: { broadcast_id: b.id, org_id: b.org_id },
        }))
      );
    });

    return { fired: due.length };
  },
);
