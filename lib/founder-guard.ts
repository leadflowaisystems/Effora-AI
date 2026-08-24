/**
 * lib/founder-guard.ts
 *
 * Server-side guard for founder-only diagnostic routes.
 *
 * Requires BOTH:
 *   1. An authenticated Supabase session (browser cookie — never a body field).
 *   2. That session's email being a founder.
 *
 * Founder membership is checked against two sources:
 *   - FOUNDER_EMAILS env var (fast path, see lib/founder.ts)
 *   - the founder_accounts table (migration 034) — read with the service-role
 *     client because that table carries a deny-all RLS policy.
 *
 * Returns the authenticated email on success, or null on any failure.
 * Callers MUST treat null as 401 and return no diagnostic data.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isFounder } from "@/lib/founder";

export async function requireFounder(): Promise<string | null> {
  // ── 1. Authenticated session (cookie-based; cannot be spoofed via body) ──
  let email: string | null = null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch (err) {
    console.error("[founder-guard] session lookup failed:", err);
    return null;
  }

  if (!email) return null;

  // ── 2a. Env-var founder list (source of truth at runtime) ───────────────
  if (isFounder(email)) return email;

  // ── 2b. founder_accounts table (audit record / fallback) ────────────────
  try {
    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (svc as any)
      .from("founder_accounts")
      .select("email")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (data) return email;
  } catch (err) {
    console.error("[founder-guard] founder_accounts lookup failed:", err);
  }

  return null;
}
