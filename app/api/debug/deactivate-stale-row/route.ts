/**
 * POST /api/debug/deactivate-stale-row
 *
 * Temporary one-shot endpoint — NO AUTH.
 * Sets active = false on integration row f685b050-f866-4c00-a625-5843298ea646.
 * Row ID is hardcoded as a safety guard — this endpoint does exactly one thing.
 *
 * REMOVE immediately after use.
 */

import { NextResponse }        from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const STALE_ROW_ID = "f685b050-f866-4c00-a625-5843298ea646";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const svc = createServiceClient();

  // Read current state before touching anything
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: before, error: readErr } = await (svc as any)
    .from("integrations")
    .select("id, org_id, active, updated_at, config")
    .eq("id", STALE_ROW_ID)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: "Read failed", detail: readErr.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Row not found", id: STALE_ROW_ID }, { status: 404 });
  }
  if (!before.active) {
    return NextResponse.json({
      result:  "already_inactive",
      message: "Row was already active=false — no change made",
      row_id:  STALE_ROW_ID,
      before,
    });
  }

  // Set active = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (svc as any)
    .from("integrations")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", STALE_ROW_ID);

  if (updateErr) {
    return NextResponse.json({ error: "Update failed", detail: updateErr.message }, { status: 500 });
  }

  // Read back to confirm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: after } = await (svc as any)
    .from("integrations")
    .select("id, org_id, active, updated_at")
    .eq("id", STALE_ROW_ID)
    .maybeSingle();

  return NextResponse.json({
    result:  "deactivated",
    row_id:  STALE_ROW_ID,
    before:  { active: before.active, updated_at: before.updated_at },
    after:   { active: after?.active, updated_at: after?.updated_at },
    confirmed: after?.active === false,
  });
}
