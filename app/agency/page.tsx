import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default async function AgencyPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  // All orgs managed by this agency owner
  const { data: orgsData } = await svc
    .from("orgs")
    .select("id, slug, name, plan, trial_ends_at, subscription_status, monthly_ai_msg_count, ai_cost_inr, created_at")
    .eq("agency_owner_id", user.id)
    .order("created_at", { ascending: false });

  type OrgRow = {
    id: string; slug: string; name: string; plan: string;
    trial_ends_at: string; subscription_status: string;
    monthly_ai_msg_count: number; ai_cost_inr: number; created_at: string;
  };
  const orgs = (orgsData ?? []) as OrgRow[];

  // Summary stats from payments (collected revenue last 30d)
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: paysData } = await svc
    .from("payments")
    .select("amount_inr, org_id")
    .in("org_id", orgs.map((o) => o.id))
    .eq("status", "paid")
    .gte("updated_at", cutoff);

  const revenueByOrg = ((paysData ?? []) as { amount_inr: number; org_id: string }[])
    .reduce<Record<string, number>>((acc, p) => {
      acc[p.org_id] = (acc[p.org_id] ?? 0) + p.amount_inr;
      return acc;
    }, {});

  const totalRevenue = Object.values(revenueByOrg).reduce((s, v) => s + v, 0);
  const paidOrgs = orgs.filter((o) => ["starter", "growth", "pro"].includes(o.plan)).length;
  const mrr = orgs.reduce((s, o) => {
    const planMrr: Record<string, number> = { starter: 2999, growth: 7999, pro: 19999 };
    return s + (planMrr[o.plan] ?? 0);
  }, 0);

  const fmtInr = (n: number) => `₹${(n / 100000).toFixed(1)}L`;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Agency Dashboard</h1>
        <p className="text-sm text-[var(--text-3)] mt-1">All client orgs you manage.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total MRR",       value: `₹${mrr.toLocaleString("en-IN")}`          },
          { label: "Active orgs",     value: `${paidOrgs} / ${orgs.length}`             },
          { label: "Revenue (30d)",   value: totalRevenue > 0 ? fmtInr(totalRevenue) : "₹0" },
          { label: "AI cost (30d)",   value: `₹${orgs.reduce((s, o) => s + Number(o.ai_cost_inr), 0).toFixed(0)}` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
            <p className="text-xs text-[var(--text-3)]">{stat.label}</p>
            <p className="font-mono text-xl font-bold text-[var(--text)] mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Org table */}
      {orgs.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-12 text-center">
          <p className="text-sm text-[var(--text-3)]">No clients yet.</p>
          <Link href="/agency/onboard-client" className="mt-3 inline-block text-sm text-[var(--brand)] hover:underline">
            Onboard your first client →
          </Link>
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-2)] text-xs text-[var(--text-3)]">
                <th className="px-4 py-3 text-left font-medium">Org</th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-left font-medium">Revenue (30d)</th>
                <th className="px-4 py-3 text-left font-medium">AI msgs</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const rev30 = revenueByOrg[org.id] ?? 0;
                const trialDays = org.plan === "trial"
                  ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
                  : null;

                return (
                  <tr key={org.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-2)] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/org/${org.slug}`} className="font-medium text-[var(--text)] hover:text-[var(--brand)] transition-colors">
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        org.plan === "pro"    && "bg-purple-950 text-purple-400",
                        org.plan === "growth" && "bg-[var(--brand-glow)] text-[var(--brand)]",
                        org.plan === "starter"&& "bg-[var(--bg-3)] text-[var(--text-2)]",
                        org.plan === "trial"  && "bg-amber-950/40 text-[var(--warn)]",
                        org.plan === "cancelled" && "bg-[var(--bg-3)] text-[var(--text-3)]",
                      )}>
                        {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)}
                        {trialDays !== null && ` (${trialDays}d left)`}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-2)]">
                      {rev30 > 0 ? `₹${rev30.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-3)]">{org.monthly_ai_msg_count}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-xs",
                        org.subscription_status === "active" && "text-[var(--brand)]",
                        org.subscription_status === "trialing" && "text-[var(--warn)]",
                        org.subscription_status === "past_due" && "text-[var(--danger)]",
                        !["active","trialing"].includes(org.subscription_status) && "text-[var(--text-3)]",
                      )}>
                        {org.subscription_status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
