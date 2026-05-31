import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { slugify } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = (body.name as string | undefined)?.trim();

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Org name must be at least 2 characters" }, { status: 400 });
  }

  const slug = body.slug ? String(body.slug).trim() : slugify(name);

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase letters, numbers, and hyphens only" },
      { status: 400 }
    );
  }

  // Use service role to bypass RLS — org + owner membership created atomically
  const service = createServiceClient();

  // Generate referral code + handle ?ref= signup bonus
  const referralCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  const referredBy = body.ref ? String(body.ref).toUpperCase().slice(0, 10) : null;

  const { data: org, error: orgError } = await service
    .from("orgs")
    .insert({ name, slug, referral_code: referralCode, ...(referredBy ? { referred_by: referredBy } : {}) })
    .select()
    .single();

  if (orgError) {
    if (orgError.code === "23505") {
      return NextResponse.json({ error: "That slug is already taken" }, { status: 409 });
    }
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  const { error: memberError } = await service.from("org_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    // Roll back org creation
    await service.from("orgs").delete().eq("id", org.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ org }, { status: 201 });
}
