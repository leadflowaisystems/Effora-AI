/**
 * /admin/health — production smoke-test dashboard.
 *
 * Runs 7 live checks in parallel server-side and displays a traffic-light
 * result table. Protected by the admin layout (isAdminEmail guard).
 *
 * Checks:
 *  1. Supabase DB        — SELECT 1 via service role client
 *  2. LLM / AI           — tiny chat completion (max_tokens: 1)
 *  3. Inngest            — INNGEST_EVENT_KEY env var + mode check
 *  4. Razorpay API       — GET /v1/orders with org key (expects 200 or 401, not network error)
 *  5. Migration 008      — verify idx_messages_conv_sent exists in pg_indexes
 *  6. isAiBlocked()      — assert known inputs produce expected outputs
 *  7. Audit log (24 h)   — count rows where event_type contains "error"
 *  8. Error log (24 h)   — count rows in error_log from last 24 h
 *  9. Hardening indexes  — verify idx_leads_org_active exists (migration 030)
 */

import { createServiceClient } from "@/lib/supabase/server";
import { isAiBlocked } from "@/lib/plan";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = { title: "Health — Admin · Effora AI" };

// Force dynamic so checks always run fresh
export const dynamic = "force-dynamic";

interface CheckResult {
  label:      string;
  ok:         boolean;
  warn?:      boolean;   // amber — degraded but not critical
  latency_ms: number;
  detail:     string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}

/* ── individual checks ─────────────────────────────────────────────────── */

async function checkSupabase(): Promise<CheckResult> {
  try {
    const { ms, result } = await timed(async () => {
      const svc = createServiceClient();
      return await svc.from("orgs").select("id", { count: "exact", head: true }).limit(1);
    });
    const err = (result as { error?: Error }).error;
    return err
      ? { label: "Supabase DB", ok: false, latency_ms: ms, detail: String(err) }
      : { label: "Supabase DB", ok: true,  latency_ms: ms, detail: "Service client connected" };
  } catch (e) {
    return { label: "Supabase DB", ok: false, latency_ms: 0, detail: String(e) };
  }
}

async function checkLlm(): Promise<CheckResult> {
  const base = process.env.LLM_BASE_URL;
  const key  = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL_FAST;

  if (!base || !key || !model) {
    return {
      label:      "LLM / AI",
      ok:         false,
      latency_ms: 0,
      detail:     `Missing env: ${[!base && "LLM_BASE_URL", !key && "LLM_API_KEY", !model && "LLM_MODEL_FAST"].filter(Boolean).join(", ")}`,
    };
  }

  try {
    const { ms, result } = await timed(() =>
      fetch(`${base}/chat/completions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages:   [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(8000),
      }).then((r) => r.json() as Promise<{ choices?: unknown[]; error?: { message: string } }>)
    );

    if (result.error) {
      return { label: "LLM / AI", ok: false, latency_ms: ms, detail: result.error.message };
    }
    return { label: "LLM / AI", ok: true, latency_ms: ms, detail: `${model} responded` };
  } catch (e) {
    return { label: "LLM / AI", ok: false, latency_ms: 0, detail: String(e) };
  }
}

async function checkInngest(): Promise<CheckResult> {
  const key = process.env.INNGEST_EVENT_KEY;
  if (!key) {
    return { label: "Inngest", ok: false, latency_ms: 0, detail: "INNGEST_EVENT_KEY not set" };
  }
  const isLocal = key === "local";
  const isProd  = process.env.NODE_ENV === "production";
  if (isProd && isLocal) {
    return {
      label: "Inngest", ok: false, latency_ms: 0,
      detail: "INNGEST_EVENT_KEY is 'local' — set a real key for production",
    };
  }
  return {
    label:      "Inngest",
    ok:         true,
    warn:       isLocal,
    latency_ms: 0,
    detail:     isLocal ? "Key = 'local' (dev mode)" : "Key configured",
  };
}

async function checkRazorpay(): Promise<CheckResult> {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return {
      label:      "Razorpay",
      ok:         false,
      latency_ms: 0,
      detail:     `Missing env: ${[!keyId && "RAZORPAY_KEY_ID", !keySecret && "RAZORPAY_KEY_SECRET"].filter(Boolean).join(", ")}`,
    };
  }

  try {
    const { ms, result } = await timed(() =>
      fetch("https://api.razorpay.com/v1/orders?count=1", {
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(8000),
      }).then((r) => ({ status: r.status }))
    );

    // 200 = valid keys, 401 = wrong keys but API reachable, 4xx = our problem
    const ok = result.status === 200 || result.status === 401;
    return {
      label:      "Razorpay",
      ok,
      warn:       result.status === 401,
      latency_ms: ms,
      detail: result.status === 200
        ? "API reachable, credentials valid"
        : result.status === 401
        ? "API reachable but credentials rejected (check RAZORPAY_KEY_ID / SECRET)"
        : `HTTP ${result.status}`,
    };
  } catch (e) {
    return { label: "Razorpay", ok: false, latency_ms: 0, detail: String(e) };
  }
}

async function checkMigration008(): Promise<CheckResult> {
  try {
    const { ms, result } = await timed(async () => {
      const svc = createServiceClient();
      // pg_indexes is accessible via service role
      return await (svc as ReturnType<typeof createServiceClient>)
        .from("pg_indexes" as never)
        .select("indexname")
        .eq("indexname" as never, "idx_messages_conv_sent" as never)
        .limit(1);
    });

    const rows = (result as { data?: unknown[] }).data ?? [];
    return rows.length > 0
      ? { label: "Migration 008 indexes", ok: true,  latency_ms: ms, detail: "idx_messages_conv_sent found" }
      : { label: "Migration 008 indexes", ok: false, latency_ms: ms, detail: "idx_messages_conv_sent NOT found — run 008_indexes.sql" };
  } catch (e) {
    return { label: "Migration 008 indexes", ok: false, latency_ms: 0, detail: String(e) };
  }
}

async function checkAiBlockLogic(): Promise<CheckResult> {
  try {
    const t0 = Date.now();
    const cases: Array<{ args: Parameters<typeof isAiBlocked>; expect: boolean; label: string }> = [
      { args: ["starter",   null, 499],  expect: false, label: "starter under-limit → false"  },
      { args: ["starter",   null, 500],  expect: true,  label: "starter at-limit → true"      },
      { args: ["growth",    null, 1999], expect: false, label: "growth under-limit → false"    },
      { args: ["growth",    null, 2000], expect: true,  label: "growth at-limit → true"        },
      { args: ["pro",       null, 9999], expect: false, label: "pro unlimited → false"         },
      { args: ["cancelled", null, 0],    expect: true,  label: "cancelled → true"              },
      {
        args: ["trial", new Date(Date.now() - 86400000).toISOString(), 1],
        expect: true,
        label: "expired trial → true",
      },
    ];

    const failures: string[] = [];
    for (const { args, expect, label } of cases) {
      const got = isAiBlocked(...args);
      if (got !== expect) failures.push(`${label}: expected ${expect}, got ${got}`);
    }

    const ms = Date.now() - t0;
    return failures.length === 0
      ? { label: "isAiBlocked() logic", ok: true,  latency_ms: ms, detail: `${cases.length} assertions passed` }
      : { label: "isAiBlocked() logic", ok: false, latency_ms: ms, detail: failures.join("; ") };
  } catch (e) {
    return { label: "isAiBlocked() logic", ok: false, latency_ms: 0, detail: String(e) };
  }
}

async function checkAuditLog(): Promise<CheckResult> {
  try {
    const { ms, result } = await timed(async () => {
      const svc  = createServiceClient();
      const since = new Date(Date.now() - 86400000).toISOString();
      return await svc
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .ilike("event", "%error%")
        .gte("created_at", since);
    });

    const count = (result as { count?: number | null }).count ?? 0;
    return {
      label:      "Audit log (24 h errors)",
      ok:         count === 0,
      warn:       count > 0 && count < 10,
      latency_ms: ms,
      detail:     count === 0 ? "No error events in last 24 h" : `${count} error event${count === 1 ? "" : "s"} in last 24 h`,
    };
  } catch (e) {
    return { label: "Audit log (24 h errors)", ok: false, latency_ms: 0, detail: String(e) };
  }
}

async function checkErrorLog(): Promise<CheckResult> {
  try {
    const { ms, result } = await timed(async () => {
      const svc   = createServiceClient();
      const since = new Date(Date.now() - 86400000).toISOString();
      return await svc
        .from("error_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
    });
    const count = (result as { count?: number | null }).count ?? 0;
    return {
      label:      "Error log (24 h)",
      ok:         count < 50,
      warn:       count >= 10 && count < 50,
      latency_ms: ms,
      detail:     count === 0
        ? "No server errors in last 24 h"
        : `${count} server error${count === 1 ? "" : "s"} in last 24 h — check /admin/errors`,
    };
  } catch (e) {
    return { label: "Error log (24 h)", ok: false, latency_ms: 0, detail: String(e) };
  }
}

async function checkHardeningIndexes(): Promise<CheckResult> {
  try {
    const { ms, result } = await timed(async () => {
      const svc = createServiceClient();
      return await (svc as ReturnType<typeof createServiceClient>)
        .from("pg_indexes" as never)
        .select("indexname")
        .eq("indexname" as never, "idx_leads_org_active" as never)
        .limit(1);
    });
    const rows = (result as { data?: unknown[] }).data ?? [];
    return rows.length > 0
      ? { label: "Hardening indexes (030)", ok: true,  latency_ms: ms, detail: "idx_leads_org_active found" }
      : { label: "Hardening indexes (030)", ok: false, latency_ms: ms, detail: "idx_leads_org_active NOT found — run migration 030" };
  } catch (e) {
    return { label: "Hardening indexes (030)", ok: false, latency_ms: 0, detail: String(e) };
  }
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default async function AdminHealthPage() {
  const checks = await Promise.allSettled([
    checkSupabase(),
    checkLlm(),
    checkInngest(),
    checkRazorpay(),
    checkMigration008(),
    checkAiBlockLogic(),
    checkAuditLog(),
    checkErrorLog(),
    checkHardeningIndexes(),
  ]);

  const results: CheckResult[] = checks.map((c, i) => {
    const fallbackLabels = [
      "Supabase DB", "LLM / AI", "Inngest", "Razorpay",
      "Migration 008 indexes", "isAiBlocked() logic", "Audit log (24 h errors)",
      "Error log (24 h)", "Hardening indexes (030)",
    ];
    if (c.status === "fulfilled") return c.value;
    return { label: fallbackLabels[i], ok: false, latency_ms: 0, detail: String(c.reason) };
  });

  const allGreen = results.every((r) => r.ok);
  const hasWarn  = results.some((r) => r.warn);
  const failCount = results.filter((r) => !r.ok).length;
  const runAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "long" });

  return (
    <div className="max-w-3xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Production Health</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            {results.length} checks · ran at {runAt}
          </p>
        </div>
        <div className={cn(
          "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold shrink-0",
          allGreen
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : failCount > 0
            ? "bg-red-500/10 text-red-400 border border-red-500/20"
            : "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        )}>
          {allGreen ? (
            <><CheckCircle2 className="h-4 w-4" /> All systems go</>
          ) : failCount > 0 ? (
            <><XCircle className="h-4 w-4" /> {failCount} check{failCount === 1 ? "" : "s"} failing</>
          ) : (
            <><AlertCircle className="h-4 w-4" /> Warnings</>
          )}
        </div>
      </div>

      {/* Results table */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-2)] text-xs text-[var(--text-3)]">
              <th className="px-5 py-3 text-left font-medium">Check</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium hidden md:table-cell">Detail</th>
              <th className="px-5 py-3 text-right font-medium w-24">Latency</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.label} className="border-b border-[var(--border)] last:border-0">
                <td className="px-5 py-3.5 font-medium text-[var(--text)] whitespace-nowrap">
                  {r.label}
                </td>
                <td className="px-5 py-3.5">
                  {r.ok && !r.warn ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Pass
                    </span>
                  ) : r.ok && r.warn ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                      <AlertCircle className="h-3 w-3" /> Warn
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-400">
                      <XCircle className="h-3 w-3" /> Fail
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-xs text-[var(--text-3)] hidden md:table-cell max-w-xs truncate">
                  {r.detail}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {r.latency_ms > 0 ? (
                    <span className={cn(
                      "inline-flex items-center gap-1 font-mono text-xs",
                      r.latency_ms < 500  ? "text-[var(--text-3)]" :
                      r.latency_ms < 2000 ? "text-amber-400" : "text-red-400",
                    )}>
                      <Clock className="h-3 w-3" />
                      {r.latency_ms}ms
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--text-3)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail cards for failures */}
      {results.filter((r) => !r.ok || r.warn).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-2)]">Details</h2>
          {results.filter((r) => !r.ok || r.warn).map((r) => (
            <div
              key={r.label}
              className={cn(
                "rounded-[var(--radius-md)] border p-4 text-sm",
                !r.ok
                  ? "border-red-500/20 bg-red-500/5"
                  : "border-amber-500/20 bg-amber-500/5",
              )}
            >
              <p className={cn("font-medium mb-1", !r.ok ? "text-red-400" : "text-amber-400")}>
                {r.label}
              </p>
              <p className="text-xs text-[var(--text-3)] font-mono break-all">{r.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Refresh hint */}
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
        <RefreshCw className="h-3 w-3" />
        Reload this page to re-run all checks live.
      </p>
    </div>
  );
}
