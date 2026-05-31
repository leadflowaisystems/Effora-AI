/**
 * /admin/errors — last 100 server errors, queryable by org.
 * Written by lib/log.ts via withErrorHandler(). No Sentry needed at this scale.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Errors — Admin · Effora AI" };
export const dynamic  = "force-dynamic";

type ErrorRow = {
  id:            string;
  org_id:        string | null;
  user_id:       string | null;
  route:         string | null;
  error_message: string;
  stack:         string | null;
  created_at:    string;
};

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams?: { org?: string };
}) {
  const svc = createServiceClient();

  let query = svc
    .from("error_log")
    .select("id, org_id, user_id, route, error_message, stack, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (searchParams?.org) {
    query = query.eq("org_id", searchParams.org);
  }

  const { data } = await query;
  const rows = (data ?? []) as ErrorRow[];

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">
          Server Errors
          {searchParams?.org && (
            <span className="ml-2 text-sm font-normal text-[var(--text-3)]">
              (org: {searchParams.org})
            </span>
          )}
        </h1>
        <span className="text-sm text-[var(--text-3)]">{rows.length} shown (max 100)</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-8 text-center">
          <p className="text-sm text-[var(--text-3)]">No errors logged yet. 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <details
              key={row.id}
              className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/5"
            >
              <summary className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-mono text-xs text-red-400 font-medium truncate">
                    {row.route ?? "(unknown route)"}
                  </p>
                  <p className="text-[var(--text)] truncate">{row.error_message}</p>
                  <p className="text-[10px] text-[var(--text-3)]">
                    {new Date(row.created_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium",
                    })}
                    {row.org_id && ` · org: ${row.org_id.slice(0, 8)}…`}
                  </p>
                </div>
              </summary>

              {row.stack && (
                <div className="border-t border-red-500/10 px-4 py-3">
                  <pre className={cn(
                    "overflow-x-auto rounded bg-[var(--bg-3)] p-3 text-[10px]",
                    "font-mono text-[var(--text-3)] leading-relaxed whitespace-pre-wrap break-words"
                  )}>
                    {row.stack}
                  </pre>
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
