/**
 * Inngest cron: daily at 1 AM UTC — notify orgs whose trial expired today.
 * Sends a copilot message so coaches see a clear prompt to upgrade.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";

export const onTrialExpiry = inngest.createFunction(
  { id: "on-trial-expiry", name: "Daily: trial expiry check", retries: 0 },
  { cron: "0 1 * * *" },
  async ({ step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc  = createServiceClient() as any;
    const today = new Date().toISOString().slice(0, 10);

    // Orgs whose trial expired today (trial_ends_at = today, still on trial plan)
    const { data: orgs } = await svc
      .from("orgs")
      .select("id, name")
      .eq("plan", "trial")
      .gte("trial_ends_at", today)
      .lt("trial_ends_at", new Date(Date.now() + 86400000).toISOString().slice(0, 10));

    let notified = 0;
    for (const org of (orgs ?? []) as { id: string; name: string }[]) {
      await step.run(`trial-expiry-${org.id}`, async () => {
        await svc.from("copilot_chats").insert({
          org_id:   org.id,
          role:     "assistant",
          content:  "Your 14-day trial ends today. To keep AI replies, CRM, and automations running, upgrade now in Settings > Billing. Takes 2 minutes.",
          metadata: { source: "trial_expiry" },
        });
        notified++;
      });
    }

    return { notified };
  }
);
