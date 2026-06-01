/**
 * Inngest cron: daily coach check-in prompt at 8 AM UTC.
 * Looks for pending commitments due today or overdue and posts a
 * copilot message so coaches see it when they open the app.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";

export const onDailyCheckin = inngest.createFunction(
  { id: "on-daily-checkin", name: "Daily: coach check-in prompts", retries: 0 },
  { cron: "0 8 * * *" }, // 8 AM UTC daily
  async ({ step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc  = createServiceClient() as any;
    const today = new Date().toISOString().slice(0, 10);

    const { data: commitments } = await svc
      .from("coach_commitments")
      .select("id, org_id, title, due_date")
      .eq("status", "pending")
      .lte("due_date", today);

    // Group by org
    const byOrg = new Map<string, { id: string; title: string; due_date: string }[]>();
    for (const c of (commitments ?? []) as { id: string; org_id: string; title: string; due_date: string }[]) {
      if (!byOrg.has(c.org_id)) byOrg.set(c.org_id, []);
      byOrg.get(c.org_id)!.push({ id: c.id, title: c.title, due_date: c.due_date });
    }

    let pinged = 0;
    for (const [orgId, items] of Array.from(byOrg.entries())) {
      await step.run(`checkin-${orgId}`, async () => {
        const top = items[0];
        const content = items.length === 1
          ? `Morning. "${top.title}" was due ${top.due_date === today ? "today" : `on ${top.due_date}`}. Did it happen?`
          : `Morning. You have ${items.length} open commitments. Top priority: "${top.title}". What is the status?`;

        await svc.from("copilot_chats").insert({
          org_id:   orgId,
          role:     "assistant",
          content,
          metadata: { source: "daily_checkin", commitment_ids: items.map((item) => item.id) },
        });
        pinged++;
      });
    }

    return { pinged };
  }
);
