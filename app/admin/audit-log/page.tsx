import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminAuditLogPage() {
  const svc = createServiceClient();
  const { data } = await svc
    .from("audit_log")
    .select("id, org_id, user_id, event, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  type ARow = { id: string; org_id: string | null; user_id: string | null; event: string; payload: Record<string,unknown>; created_at: string };
  const rows = (data ?? []) as ARow[];

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="font-display text-2xl font-bold">Audit Log ({rows.length})</h1>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-2)] text-xs text-[var(--text-3)]">
              <th className="px-4 py-3 text-left font-medium">Event</th>
              <th className="px-4 py-3 text-left font-medium">Payload</th>
              <th className="px-4 py-3 text-left font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-[var(--brand)]">{r.event}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-3)] max-w-xs truncate">
                  {JSON.stringify(r.payload)}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--text-3)] whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[var(--text-3)]">No events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
