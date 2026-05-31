import { createServiceClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { TriggerWeeklyReportBtn } from "./trigger-weekly-report-btn";

export default async function AdminOrgsPage() {
  const svc = createServiceClient();

  const { data: orgsData } = await svc
    .from("orgs")
    .select("id, slug, name, plan, subscription_status, monthly_ai_msg_count, ai_cost_inr, created_at, trial_ends_at")
    .order("created_at", { ascending: false })
    .limit(200);

  // Get owner emails via org_members + auth.users (service role)
  const { data: membersData } = await svc
    .from("org_members")
    .select("org_id, user_id, role")
    .eq("role", "owner");

  type MemberRow = { org_id: string; user_id: string; role: string };
  const ownerByOrg: Record<string, string> = {};
  for (const m of (membersData ?? []) as MemberRow[]) {
    ownerByOrg[m.org_id] = m.user_id;
  }

  type OrgRow = {
    id: string; slug: string; name: string; plan: string;
    subscription_status: string; monthly_ai_msg_count: number;
    ai_cost_inr: number; created_at: string; trial_ends_at: string;
  };
  const orgs = (orgsData ?? []) as OrgRow[];

  const planMrr: Record<string, number> = { starter: 2999, growth: 7999, pro: 19999 };
  const totalMrr = orgs.reduce((s, o) => s + (planMrr[o.plan] ?? 0), 0);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl font-bold">Orgs ({orgs.length})</h1>
        <TriggerWeeklyReportBtn />
        <div className="text-sm text-[var(--text-3)]">
          MRR: <span className="font-mono font-bold text-[var(--brand)]">₹{totalMrr.toLocaleString("en-IN")}</span>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-2)] text-xs text-[var(--text-3)]">
              {["Org","Plan","Status","AI msgs","AI cost","Created"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => {
              const trialDays = org.plan === "trial"
                ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
                : null;
              return (
                <tr key={org.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-2)] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/org/${org.slug}/dashboard`} className="font-medium text-[var(--text)] hover:text-[var(--brand)] transition-colors">
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      org.plan === "pro"    ? "bg-purple-950 text-purple-400"       : "",
                      org.plan === "growth" ? "bg-[var(--brand-glow)] text-[var(--brand)]" : "",
                      org.plan === "trial"  ? "bg-amber-950/40 text-[var(--warn)]" : "",
                      org.plan === "starter"? "bg-[var(--bg-3)] text-[var(--text-2)]" : "",
                      org.plan === "cancelled" ? "bg-[var(--bg-3)] text-[var(--text-3)]" : "",
                    )}>
                      {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)}
                      {trialDays !== null && ` (${trialDays}d)`}
                    </span>
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-xs",
                    org.subscription_status === "active"   && "text-[var(--brand)]",
                    org.subscription_status === "past_due" && "text-[var(--danger)]",
                    !["active"].includes(org.subscription_status) && "text-[var(--text-3)]",
                  )}>
                    {org.subscription_status}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-3)]">{org.monthly_ai_msg_count}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-3)]">₹{Number(org.ai_cost_inr).toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-3)]">
                    {new Date(org.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
