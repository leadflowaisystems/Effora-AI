/**
 * GET /api/debug/ig-subscription-public
 *
 * Temporary PUBLIC diagnostic — NO AUTH.
 * Returns ALL meta_instagram integration rows + subscribed_apps call
 * for IG account 17841424594812508 using the most-recently-created token.
 * REMOVE immediately after debugging is complete.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";

const GRAPH   = "https://graph.facebook.com/v18.0";
const IG_ACCT = "17841424594812508";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const svc = createServiceClient();

  // Fetch ALL meta_instagram rows regardless of active status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: dbErr } = await (svc as any)
    .from("integrations")
    .select("id, org_id, active, created_at, config")
    .eq("provider", "meta_instagram")
    .order("created_at", { ascending: false });

  if (dbErr) {
    return NextResponse.json({ error: "DB query failed", detail: dbErr.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No meta_instagram integrations found at all" }, { status: 404 });
  }

  // Build a safe summary of every row — no raw tokens
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = rows.map((r: any) => {
    const cfg = (r.config ?? {}) as Record<string, string>;
    return {
      id:                            r.id,
      org_id:                        r.org_id,
      active:                        r.active,
      created_at:                    r.created_at,
      page_id:                       cfg.page_id ?? null,
      instagram_business_account_id: cfg.instagram_business_account_id ?? null,
      ig_username:                   cfg.ig_username ?? null,
      has_access_token_enc:          !!cfg.access_token_enc,
      has_user_access_token_enc:     !!cfg.user_access_token_enc,
      token_expires_at:              cfg.token_expires_at ?? null,
    };
  });

  // Use the most-recently-created active row that has a user token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = rows.find((r: any) =>
    r.active && (r.config as Record<string, string>)?.user_access_token_enc
  );

  if (!candidate) {
    return NextResponse.json({
      total_rows:   rows.length,
      rows_summary: summary,
      subscribed_apps: null,
      error: "No active row with user_access_token_enc found — cannot call subscribed_apps",
    });
  }

  // Decrypt user token from the candidate row
  let userToken: string;
  try {
    userToken = decryptSecret((candidate.config as Record<string, string>).user_access_token_enc);
  } catch (e) {
    return NextResponse.json({
      total_rows:       rows.length,
      rows_summary:     summary,
      candidate_row_id: candidate.id,
      subscribed_apps:  null,
      error:            "Decryption failed",
      detail:           String(e),
    });
  }

  // Call Meta subscribed_apps
  const url = new URL(`${GRAPH}/${IG_ACCT}/subscribed_apps`);
  url.searchParams.set("access_token", userToken);
  const metaRes  = await fetch(url.toString());
  const metaJson = await metaRes.json();

  return NextResponse.json({
    total_rows:       rows.length,
    rows_summary:     summary,
    candidate_row_id: candidate.id,
    subscribed_apps:  metaJson,
  });
}
