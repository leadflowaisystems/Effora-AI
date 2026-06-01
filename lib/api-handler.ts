/**
 * Wraps an API route handler in a try/catch that always returns valid JSON.
 * Unhandled errors are written to error_log (non-fatal) before returning 500.
 *
 * Usage:
 *   export const POST = withErrorHandler("route-name", async (req, ctx) => { ... });
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
      // Fire-and-forget error log — never await so it doesn't slow down the 500 response
      void logError(err, { route: routeName });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
