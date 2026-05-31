/**
 * POST /api/agency/onboard
 * Creates a new org on behalf of an agency owner.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
}

function genReferralCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  // Verify agency
  const { data: flagRow } = await svc
    .from("user_flags").select("is_agency").eq("user_id", user.id).single();
  if (!(flagRow as { is_agency: boolean } | null)?.is_agency) {
    return NextResponse.json({ error: "Not an agency account" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { orgName, coachEmail, calLink, tone, offer, priceRange } = body as {
    orgName: string; coachEmail?: string; calLink?: string;
    tone?: string; offer?: string; priceRange?: string;
  };

  if (!orgName) return NextResponse.json({ error: "orgName required" }, { status: 400 });

  const slug         = slugify(orgName);
  const referralCode = genReferralCode();

  const { data: orgRow, error: orgErr } = await svc.from("orgs").insert({
    slug,
    name:            orgName,
    plan:            "trial",
    agency_owner_id: user.id,
    referral_code:   referralCode,
  }).select("id, slug").single();

  if (orgErr || !orgRow) {
    return NextResponse.json({ error: orgErr?.message ?? "Failed to create org" }, { status: 500 });
  }

  const orgId = (orgRow as { id: string; slug: string }).id;
  const orgSlug = (orgRow as { id: string; slug: string }).slug;

  // Add agency owner as org member (owner role)
  await svc.from("org_members").insert({ org_id: orgId, user_id: user.id, role: "owner" });

  // Create voice profile if offer provided
  if (offer || tone) {
    await svc.from("voice_profiles").insert({
      org_id:       orgId,
      tone:         tone ?? "friendly and direct",
      offer:        offer ?? "",
      price_range:  priceRange ?? "",
      sells:        offer ?? "",
      objections:   [],
      extra_context: coachEmail ? `Coach email: ${coachEmail}` : "",
    });
  }

  // Save Cal.com integration if link provided
  if (calLink) {
    await svc.from("integrations").insert({
      org_id:   orgId,
      provider: "calcom",
      config:   { booking_url: calLink },
      active:   true,
    });
  }

  await logAudit(svc, orgId, user.id, "agency.client_onboarded", { orgName, coachEmail });

  return NextResponse.json({ ok: true, slug: orgSlug, orgId });
}
