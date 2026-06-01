/**
 * Thin wrapper to insert rows into the audit_log table.
 * Non-fatal — errors are swallowed so they don't break main flows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function logAudit(
  svc:     SupabaseClient,
  orgId:   string | null,
  userId:  string | null,
  event:   string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await svc.from("audit_log").insert({
      org_id:  orgId,
      user_id: userId,
      event,
      payload,
    });
  } catch { /* non-fatal */ }
}
