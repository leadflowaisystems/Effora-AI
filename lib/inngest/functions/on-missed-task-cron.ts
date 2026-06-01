/**
 * Inngest cron: daily at 6 PM UTC — detects overdue commitments and
 * posts a copilot nudge asking what is blocking the coach.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";

export const onMissedTaskCron = inngest.createFunction(
  { id: "on-missed-task-cron", name: "Daily: missed commitment detection", retries: 0 },
  { cron: "0 18 * * *" }, // 6 PM UTC daily
  async ({ step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc       = createServiceClient() as any;
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Find pending commitments past due date by more than 1 day
    const { data: missed } = await svc
      .from("coach_commitments")
      .select("id, org_id, title, due_date")
      .eq("status", "pending")
      .lt("due_date", yesterday);

    let pinged = 0;
    for (const c of (missed ?? []) as { id: string; org_id: string; title: string; due_date: string }[]) {
      await step.run(`missed-${c.id}`, async () => {
        const daysLate = Math.floor(
          (new Date(today).getTime() - new Date(c.due_date).getTime()) / 86400000
        );
        const msg = `"${c.title}" was due ${daysLate} day${daysLate !== 1 ? "s" : ""} ago and is still open. What is blocking you?`;

        await svc.from("copilot_chats").insert({
          org_id:   c.org_id,
          role:     "assistant",
          content:  msg,
          metadata: { source: "missed_task", commitment_id: c.id },
        });
        pinged++;
      });
    }

    return { pinged };
  }
);
