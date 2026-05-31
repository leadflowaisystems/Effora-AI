/**
 * Inngest cron: weekly performance email to coaches.
 * Fires every Monday at 9 AM UTC.
 */

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

function weeklyReportHtml(p: {
  coachName:    string;
  orgName:      string;
  newLeads:     number;
  repliesSent:  number;
  booked:       number;
  showed:       number;
  paid:         number;
  revenueInr:   number;
  prevRevInr:   number;
  appUrl:       string;
  wins:         string[];
  gaps:         string[];
}): string {
  const revChange = p.prevRevInr > 0
    ? ((p.revenueInr - p.prevRevInr) / p.prevRevInr * 100).toFixed(0)
    : null;
  const revSign  = revChange ? (Number(revChange) >= 0 ? "+" : "") : "";
  const card = `max-width:520px;margin:32px auto;background:#141418;border:1px solid #2A2A30;border-radius:12px;padding:32px;font-family:-apple-system,sans-serif;`;
  const h1  = `font-size:20px;font-weight:700;color:#E8E8EC;margin:0 0 4px;`;
  const sub = `font-size:13px;color:#9B9BA8;margin:0 0 28px;`;
  const row = `display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2A2A30;`;
  const lbl = `font-size:13px;color:#9B9BA8;`;
  const val = `font-size:13px;font-weight:700;color:#E8E8EC;font-family:monospace;`;
  const jade = `color:#39D68A;`;
  const btn = `display:inline-block;background:#39D68A;color:#0A0A0C;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:24px;`;
  const winItem = (w: string) => `<li style="font-size:12px;color:#9B9BA8;margin-bottom:4px;">&#x2705; ${w}</li>`;
  const gapItem = (g: string) => `<li style="font-size:12px;color:#9B9BA8;margin-bottom:4px;">&#x26A0;&#xFE0F; ${g}</li>`;

  return `<!DOCTYPE html><html><body style="background:#0A0A0C;margin:0;padding:0;">
<div style="${card}">
  <h1 style="${h1}">Weekly report &middot; ${p.orgName}</h1>
  <p style="${sub}">Hi ${p.coachName}, here&apos;s your 7-day performance summary.</p>
  <div style="${row}"><span style="${lbl}">New leads</span><span style="${val}">${p.newLeads}</span></div>
  <div style="${row}"><span style="${lbl}">AI replies sent</span><span style="${val}">${p.repliesSent}</span></div>
  <div style="${row}"><span style="${lbl}">Calls booked</span><span style="${val}">${p.booked}</span></div>
  <div style="${row}"><span style="${lbl}">Showed up</span><span style="${val}">${p.showed}</span></div>
  <div style="${row}"><span style="${lbl}">Clients paid</span><span style="${val}">${p.paid}</span></div>
  <div style="${row}"><span style="${lbl}">Revenue collected</span><span style="${val} ${jade}">&#x20B9;${p.revenueInr.toLocaleString("en-IN")}${revChange ? ` (${revSign}${revChange}%)` : ""}</span></div>
  ${p.wins.length > 0 ? `<div style="margin-top:20px;"><p style="font-size:12px;font-weight:600;color:#39D68A;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">This week&apos;s wins</p><ul style="margin:0;padding-left:16px;">${p.wins.map(winItem).join("")}</ul></div>` : ""}
  ${p.gaps.length > 0 ? `<div style="margin-top:16px;"><p style="font-size:12px;font-weight:600;color:#F59E0B;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">Needs attention</p><ul style="margin:0;padding-left:16px;">${p.gaps.map(gapItem).join("")}</ul></div>` : ""}
  <a href="${p.appUrl}" style="${btn}">Open Effora AI to handle this week &rarr;</a>
</div></body></html>`;
}

export const onWeeklyReport = inngest.createFunction(
  { id: "on-weekly-report", name: "Weekly: send coach performance email", retries: 0 },
  [{ cron: "0 9 * * 1" }, { event: "test/weekly-report.trigger" }], // cron + manual test trigger
  async ({ step }) => {
    const svc     = createServiceClient();
    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai.vercel.app";
    const now     = new Date();
    const weekAgo = new Date(now.getTime() - 7  * 86400000).toISOString();
    const twoWAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

    // Load all active orgs
    const { data: orgs } = await svc.from("orgs")
      .select("id, name, slug, plan, subscription_status")
      .not("plan", "in", '("cancelled")');

    const activeOrgs = (orgs ?? []) as { id: string; name: string; slug: string; plan: string; subscription_status: string }[];

    const results: string[] = [];
    for (const org of activeOrgs) {
      await step.run(`report-${org.id}`, async () => {
        const [convR, msgR, bookR, showR, payR, prevPayR, memberR] = await Promise.all([
          svc.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", org.id).gte("created_at", weekAgo),
          svc.from("messages").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("direction", "outbound").gte("sent_at", weekAgo),
          svc.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "confirmed").gte("created_at", weekAgo),
          svc.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "completed").gte("updated_at", weekAgo),
          svc.from("payments").select("amount_inr").eq("org_id", org.id).eq("status", "paid").gte("updated_at", weekAgo),
          svc.from("payments").select("amount_inr").eq("org_id", org.id).eq("status", "paid").gte("updated_at", twoWAgo).lt("updated_at", weekAgo),
          svc.from("org_members").select("user_id").eq("org_id", org.id).eq("role", "owner").single(),
        ]);

        const revenue     = ((payR.data ?? []) as { amount_inr: number }[]).reduce((s, r) => s + r.amount_inr, 0);
        const prevRevenue = ((prevPayR.data ?? []) as { amount_inr: number }[]).reduce((s, r) => s + r.amount_inr, 0);
        const ownerId     = (memberR.data as { user_id: string } | null)?.user_id;
        if (!ownerId) return;

        // Get owner email via auth admin API
        let email: string | null = null;
        try {
          const { data: adminData } = await svc.auth.admin.getUserById(ownerId);
          email = adminData?.user?.email ?? null;
        } catch {
          // auth.admin not available — skip this org silently
          console.warn("[weekly-report] auth.admin.getUserById failed for", ownerId);
        }
        if (!email) return;

        // count fields come from the response root, not .data, when head:true is used
        const convCount  = convR.count  ?? 0;
        const msgCount   = msgR.count   ?? 0;
        const bookCount  = bookR.count  ?? 0;
        const showCount  = showR.count  ?? 0;
        const paidCount  = (payR.data ?? []).length;

        const wins: string[] = [];
        const gaps: string[] = [];
        if (paidCount > 0)    wins.push(`${paidCount} client${paidCount !== 1 ? "s" : ""} paid this week`);
        if (revenue > 0)      wins.push(`₹${revenue.toLocaleString("en-IN")} collected`);
        if (bookCount > 0)    wins.push(`${bookCount} call${bookCount !== 1 ? "s" : ""} booked`);

        // Check for unpaid payments > 48h
        const { count: unpaidCount } = await svc.from("payments")
          .select("id", { count: "exact", head: true })
          .eq("org_id", org.id).eq("status", "pending")
          .lt("created_at", new Date(Date.now() - 48 * 3600000).toISOString());
        if ((unpaidCount ?? 0) > 0) gaps.push(`${unpaidCount} payment link${(unpaidCount ?? 0) !== 1 ? "s" : ""} unpaid for 48h+`);

        await sendEmail({
          to:       email,
          subject:  `Your Effora AI weekly report — ${now.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`,
          html:     weeklyReportHtml({
            coachName:   "Coach",
            orgName:     org.name,
            newLeads:    convCount,
            repliesSent: msgCount,
            booked:      bookCount,
            showed:      showCount,
            paid:        paidCount,
            revenueInr:  revenue,
            prevRevInr:  prevRevenue,
            appUrl:      `${appUrl}/org/${org.slug}/dashboard`,
            wins,
            gaps,
          }),
          orgId:    org.id,
          template: "weeklyReport",
        }).catch(() => null);
        results.push(org.id);
      });
    }
    return { sent: results.length };
  }
);
