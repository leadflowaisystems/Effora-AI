import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminAiCostsPage() {
  const svc = createServiceClient();

  const { data: usageData } = await svc
    .from("ai_usage")
    .select("org_id, month, tokens_in, tokens_out, cost_inr")
    .order("month", { ascending: false })
    .limit(200);

  const { data: orgsData } = await svc.from("orgs").select("id, name, slug");
  const orgNames: Record<string, string> = {};
  for (const o of (orgsData ?? []) as { id: string; name: string; slug: string }[]) {
    orgNames[o.id] = o.name;
  }

  type UsageRow = { org_id: string; month: string; tokens_in: number; tokens_out: number; cost_inr: number };
  const rows = (usageData ?? []) as UsageRow[];

  const totalCost = rows.reduce((s, r) => s + Number(r.cost_inr), 0);
  const totalTokens = rows.reduce((s, r) => s + r.tokens_in + r.tokens_out, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="font-display text-2xl font-bold">AI Costs</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
          <p className="text-xs text-[var(--text-3)]">Total tokens used</p>
          <p className="font-mono text-2xl font-bold text-[var(--text)] mt-1">
            {(totalTokens / 1000).toFixed(1)}k
          </p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
          <p className="text-xs text-[var(--text-3)]">Total AI cost</p>
          <p className="font-mono text-2xl font-bold text-[var(--brand)] mt-1">
            ₹{totalCost.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-2)] text-xs text-[var(--text-3)]">
              <th className="px-4 py-3 text-left font-medium">Org</th>
              <th className="px-4 py-3 text-left font-medium">Month</th>
              <th className="px-4 py-3 text-left font-medium">Tokens in</th>
              <th className="px-4 py-3 text-left font-medium">Tokens out</th>
              <th className="px-4 py-3 text-left font-medium">Cost (INR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-medium text-[var(--text)]">{orgNames[r.org_id] ?? r.org_id.slice(0,8)}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-3)]">{r.month.slice(0,7)}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-3)]">{r.tokens_in.toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-3)]">{r.tokens_out.toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--brand)]">₹{Number(r.cost_inr).toFixed(4)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--text-3)]">No AI usage data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
