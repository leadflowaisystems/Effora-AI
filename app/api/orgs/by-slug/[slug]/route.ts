/**
 * GET /api/orgs/by-slug/[slug] — look up org ID from slug (for client-side pages)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: org } = await svc.from("orgs").select("id, name, slug").eq("slug", params.slug).single();
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify membership
  const { data: member } = await svc.from("org_members").select("role")
    .eq("org_id", (org as { id: string }).id).eq("user_id", user.id).single();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  return NextResponse.json(org);
}
