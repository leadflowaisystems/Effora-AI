/**
 * POST /api/admin/backfill-ig-names
 *
 * One-shot backfill: find all Instagram leads whose stored name is a fallback
 * placeholder ("IG …xxx", "@IG …xxx", raw numeric IGSID) and attempt to resolve
 * a real display name via getIgUserProfile() using the org's page token.
 *
 * Admin-only. Rate-limited to 1 req/sec per lead to stay within Meta API limits.
 *
 * Response: { processed, updated, skipped, errors, results[] }
 *
 * Safe to re-run — already-resolved names are skipped.
 */

export const runtime     = "nodejs";
export const maxDuration = 60; // may take time for large datasets

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { getIgUserProfile } from "@/lib/integrations/meta-instagram";
import { decryptSecret } from "@/lib/crypto";

/** Returns true if the stored name is a placeholder that should be enriched. */
function isPlaceholderName(name: string | null, igsid: string): boolean {
  if (!name) return true;
  if (/^\d+$/.test(name)) return true;               // raw numeric IGSID
  if (name === igsid) return true;                    // stored as the raw IGSID
  if (name.startsWith("IG …")) return true;           // short-ID fallback
  if (name.startsWith("IG .")) return true;           // variant with regular ellipsis
  if (name.startsWith("@IG …")) return true;          // "@IG …" artifact from webhook bug
  if (name.startsWith("@IG .")) return true;
  return false;
}

/** Wait `ms` milliseconds — used to stay within Meta API rate limits. */
function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  // ── Auth: admin only ──────────────────────────────────────────────────────
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body     = await req.json().catch(() => ({})) as { dry_run?: boolean; limit?: number };
  const dryRun   = body.dry_run === true;
  const maxLeads = Math.min(body.limit ?? 500, 2000);

  const svc = createServiceClient();

  // ── 1. Fetch all Instagram leads with placeholder names ───────────────────
  const { data: leads, error: leadsErr } = await svc
    .from("leads")
    .select("id, name, external_id, org_id")
    .eq("channel", "instagram")
    .limit(maxLeads);

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  }

  const candidates = (leads ?? []).filter((l) => {
    const igsid = ((l.external_id as string | null) ?? "").replace(/^ig_/, "");
    return isPlaceholderName(l.name as string | null, igsid);
  }) as Array<{ id: string; name: string | null; external_id: string; org_id: string }>;

  console.log(`[backfill-ig-names] found ${candidates.length} candidates from ${(leads ?? []).length} Instagram leads`);

  if (candidates.length === 0) {
    return NextResponse.json({ processed: 0, updated: 0, skipped: 0, errors: 0, results: [] });
  }

  // ── 2. Cache page tokens per org (avoid re-fetching on every lead) ────────
  const tokenCache = new Map<string, string | null>();
  async function getPageToken(orgId: string): Promise<string | null> {
    if (tokenCache.has(orgId)) return tokenCache.get(orgId) ?? null;
    const { data: intRow } = await svc
      .from("integrations")
      .select("config, active")
      .eq("org_id", orgId)
      .eq("provider", "meta_instagram")
      .single();
    let token: string | null = null;
    if (intRow?.active && (intRow.config as Record<string, unknown>)?.access_token_enc) {
      try {
        token = decryptSecret((intRow.config as Record<string, string>).access_token_enc);
      } catch { /* non-fatal */ }
    }
    tokenCache.set(orgId, token);
    return token;
  }

  // ── 3. Enrich each candidate ───────────────────────────────────────────────
  const results: Array<{
    lead_id: string; old_name: string | null; new_name: string | null; status: "updated" | "skipped" | "error"
  }> = [];
  let updated = 0, skipped = 0, errors = 0;
  const now = new Date().toISOString();

  for (const lead of candidates) {
    const igsid = lead.external_id.replace(/^ig_/, "");
    try {
      const pageToken = await getPageToken(lead.org_id);
      if (!pageToken) {
        skipped++;
        results.push({ lead_id: lead.id, old_name: lead.name, new_name: null, status: "skipped" });
        continue;
      }

      const profile = await getIgUserProfile(igsid, pageToken);

      // Only accept a name that is genuinely different from a placeholder
      const realName = (!profile.name.startsWith("IG …") && !profile.name.startsWith("IG ."))
        ? profile.name
        : null;
      const realUsername = (profile.username && !/^\d+$/.test(profile.username))
        ? `@${profile.username}`
        : null;
      const bestName = realName || realUsername;

      if (!bestName) {
        skipped++;
        results.push({ lead_id: lead.id, old_name: lead.name, new_name: null, status: "skipped" });
      } else if (dryRun) {
        updated++;
        results.push({ lead_id: lead.id, old_name: lead.name, new_name: bestName, status: "updated" });
      } else {
        await svc.from("leads").update({ name: bestName, updated_at: now }).eq("id", lead.id);
        updated++;
        results.push({ lead_id: lead.id, old_name: lead.name, new_name: bestName, status: "updated" });
        console.log(`[backfill-ig-names] updated lead ${lead.id}: "${lead.name}" → "${bestName}"`);
      }
    } catch (err) {
      errors++;
      results.push({ lead_id: lead.id, old_name: lead.name, new_name: null, status: "error" });
      console.warn(`[backfill-ig-names] error for lead ${lead.id}:`, err);
    }

    // Rate limit: 1 req / 250ms to stay well within Meta's 200 req/hr per user-token
    await sleep(250);
  }

  return NextResponse.json({
    dry_run:   dryRun,
    processed: candidates.length,
    updated,
    skipped,
    errors,
    results,
  });
}
