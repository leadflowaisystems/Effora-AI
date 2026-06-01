/**
 * PATCH /api/orgs/[orgId]
 * Update top-level org fields (name, onboarding_completed_at).
 * Service role — no RLS restriction.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  // Verify the caller is authenticated and a member of this org
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", params.orgId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const update: {
    name?: string;
    onboarding_completed_at?: string | null;
    auto_send_replies?: boolean;
  } = {};

  if ("name" in body && typeof body.name === "string") update.name = body.name;
  if ("onboarding_completed_at" in body) {
    update.onboarding_completed_at =
      typeof body.onboarding_completed_at === "string"
        ? body.onboarding_completed_at
        : null;
  }
  if ("auto_send_replies" in body && typeof body.auto_send_replies === "boolean") {
    update.auto_send_replies = body.auto_send_replies;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("orgs")
    .update(update)
    .eq("id", params.orgId)
    .select("id, slug, name, active_channel, onboarding_completed_at, auto_send_replies")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ org: data });
}
