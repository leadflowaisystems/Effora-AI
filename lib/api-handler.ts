/**
 * Wraps an API route handler in a try/catch that always returns valid JSON.
 * Unhandled errors are written to error_log (non-fatal) before returning 500.
 *
 * Usage:
 *   export const POST = withErrorHandler("route-name", async (req, ctx) => { ... });
 *
 * Also exports sanitizeDbError() — maps raw Supabase/Postgres error objects to
 * safe user-facing messages so database schema details never leak to clients.
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/log";

type Handler<C = unknown> = (req: NextRequest, ctx: C) => Promise<NextResponse>;

export function withErrorHandler<C = unknown>(
  routeName: string,
  handler: Handler<C>,
): Handler<C> {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      console.error(`[${routeName}] unhandled error:`, err);
      // Race logError against a 5-second timeout so a DB outage doesn't hold
      // the serverless function open after the 500 has conceptually been sent.
      void Promise.race([
        logError(err, { route: routeName }),
        new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
      ]);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

/**
 * Maps a raw Supabase/Postgres error object to a safe user-facing string.
 *
 * Raw Supabase error messages can expose table names, index names, constraint
 * names, and column names.  Always pass errors through this before sending
 * them to the client.
 *
 * @param err  - The raw error from a Supabase query ({ code, message, details })
 * @param fallback - Default message shown for unmapped codes
 */
export function sanitizeDbError(
  err: { code?: string; message?: string } | null | undefined,
  fallback = "Database error",
): { message: string; status: number } {
  if (!err) return { message: fallback, status: 500 };

  switch (err.code) {
    case "23505": return { message: "This record already exists.",          status: 409 };
    case "23503": return { message: "Referenced record not found.",         status: 400 };
    case "23514": return { message: "Value violates a data constraint.",    status: 400 };
    case "42P01": return { message: "Service configuration error.",         status: 500 };
    case "PGRST116": return { message: "Record not found.",                 status: 404 };
    default:      return { message: fallback,                               status: 500 };
  }
}
