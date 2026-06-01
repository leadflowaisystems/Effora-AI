/**
 * Server-side error logger.
 *
 * Writes a row to error_log via service role so unhandled route errors
 * are queryable from /admin/errors without needing Sentry.
 *
 * Non-fatal: every method silently ignores its own failures.
 */

import { createServiceClient } from "@/lib/supabase/server";

interface ErrorContext {
  orgId?:   string | null;
  userId?:  string | null;
  route?:   string;
}

export async function logError(
  err:     unknown,
  context: ErrorContext = {},
): Promise<void> {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack   = err instanceof Error ? (err.stack ?? null) : null;
    const svc     = createServiceClient();

    await svc.from("error_log").insert({
      org_id:        context.orgId  ?? null,
      user_id:       context.userId ?? null,
      route:         context.route  ?? null,
      error_message: message.slice(0, 2000),
      stack:         stack?.slice(0, 5000) ?? null,
    });
  } catch {
    // Never throw — error logging must be fire-and-forget
  }
}
