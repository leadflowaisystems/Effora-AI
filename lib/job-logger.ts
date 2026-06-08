/**
 * lib/job-logger.ts
 *
 * Lightweight Inngest job execution logger.
 * Writes start/complete/fail rows to job_runs via service role.
 * Fire-and-forget — never throws, never blocks the Inngest function.
 *
 * Usage inside an Inngest function:
 *
 *   import { jobLogger } from "@/lib/job-logger";
 *
 *   export const myFn = inngest.createFunction(
 *     { id: "my-function" },
 *     { event: "my/event" },
 *     async ({ event, step }) => {
 *       const log = jobLogger("my-function", event.name, event.data?.orgId);
 *       await log.started();
 *       try {
 *         // ... do work ...
 *         await log.completed();
 *       } catch (err) {
 *         await log.failed(err);
 *         throw err;  // re-throw so Inngest retries
 *       }
 *     }
 *   );
 */

import { createServiceClient } from "@/lib/supabase/server";

export interface JobLogHandle {
  started():           Promise<void>;
  completed():         Promise<void>;
  failed(err: unknown): Promise<void>;
}

export function jobLogger(
  functionName: string,
  eventName?:   string | null,
  orgId?:       string | null,
  runId?:       string | null,
): JobLogHandle {
  let rowId: string | null = null;
  const startedAt = Date.now();

  async function write(fields: Record<string, unknown>): Promise<void> {
    try {
      const svc = createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc as any).from("job_runs").upsert(
        { id: rowId ?? undefined, ...fields },
        { onConflict: "id" }
      );
    } catch {
      // Never throw — logging must be fire-and-forget
    }
  }

  return {
    async started() {
      try {
        const svc = createServiceClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (svc as any).from("job_runs").insert({
          function_name: functionName,
          event_name:    eventName ?? null,
          org_id:        orgId     ?? null,
          run_id:        runId     ?? null,
          status:        "started",
        }).select("id").single();
        rowId = (data as { id: string } | null)?.id ?? null;
      } catch {
        // Never throw
      }
    },

    async completed() {
      const durationMs = Date.now() - startedAt;
      await write({
        id:          rowId ?? crypto.randomUUID(),
        function_name: functionName,
        status:      "completed",
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      });
    },

    async failed(err: unknown) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      await write({
        id:            rowId ?? crypto.randomUUID(),
        function_name: functionName,
        status:        "failed",
        finished_at:   new Date().toISOString(),
        duration_ms:   durationMs,
        error_message: message.slice(0, 2000),
      });
    },
  };
}
