import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminRevenuePage() {
  const svc = createServiceClient();

  // Plan distribution
  const { data: orgsData } = await svc
    .from("orgs")
    .select("plan, subscription_status, created_at")
    .order("created_at", { ascending: false });

  type OrgRow = { plan: string; subscription_status: string; created_at: string };
  const orgs = (orgsData ?? []) as OrgRow[];

  const planDist: Record<string, number> = {};
  for (const o of orgs) { planDist[o.plan] = (planDist[o.plan] ?? 0) + 1; }

  const planMrr: Record<string, number> = { starter: 2999, growth: 7999, pro: 19999 };
  const mrr = orgs.reduce((s, o) => s + (planMrr[o.plan] ?? 0), 0);

  const paidCount = orgs.filter((o) => ["starter","growth","pro"].includes(o.plan)).length;
  const trialCount = orgs.filter((o) => o.plan === "trial").length;
  const conversion = orgs.length > 0 ? ((paidCount / orgs.length) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-2xl font-bold">Revenue</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "MRR",              value: `₹${mrr.toLocaleString("en-IN")}`    },
          { label: "Paid orgs",        value: paidCount                             },
          { label: "Trial orgs",       value: trialCount                            },
          { label: "Trial→Paid conv.", value: `${conversion}%`                      },
        ].map((s) => (
          <div key={s.label} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
            <p className="text-xs text-[var(--text-3)]">{s.label}</p>
            <p className="font-mono text-xl font-bold text-[var(--text)] mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Plan distribution */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-6">
        <h2 className="font-display font-semibold text-[var(--text)] mb-4">Plan distribution</h2>
        <div className="space-y-3">
          {Object.entries(planDist).map(([plan, count]) => {
            const pct = Math.round((count / orgs.length) * 100);
            return (
              <div key={plan}>
                <div className="flex items-center justify-between mb-1 text-sm">
                  <span className="capitalize text-[var(--text-2)]">{plan}</span>
                  <span className="font-mono text-[var(--text-3)]">{count} ({pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-3)]">
                  <div
                    className="h-full rounded-full bg-[var(--brand)] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
