import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminWaitlistPage() {
  const svc = createServiceClient();
  const { data } = await svc.from("waitlist").select("*").order("created_at", { ascending: false }).limit(500);
  type WRow = { id: string; email: string; source: string; created_at: string };
  const rows = (data ?? []) as WRow[];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Waitlist ({rows.length})</h1>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-2)] text-xs text-[var(--text-3)]">
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Source</th>
              <th className="px-4 py-3 text-left font-medium">Signed up</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-[var(--text)]">{r.email}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-3)]">{r.source}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-3)]">
                  {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[var(--text-3)]">No waitlist signups yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
