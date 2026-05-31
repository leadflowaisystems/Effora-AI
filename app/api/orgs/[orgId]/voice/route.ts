/**
 * GET   /api/orgs/[orgId]/voice  — read voice profile
 * PUT   /api/orgs/[orgId]/voice  — upsert voice profile
 *
 * Voice profile is stored 1-per-org in the voice_profiles table.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { sanitizeText } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();
  return data ? user : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data } = await service
    .from("voice_profiles")
    .select("*")
    .eq("org_id", params.orgId)
    .single();

  // Return null if not yet created — client shows empty form
  return NextResponse.json({ voiceProfile: data ?? null });
}

const VoiceSchema = z.object({
  tone:          z.string().min(1).max(500).optional(),
  offer:         z.string().min(1).max(500).optional(),
  price_range:   z.string().max(200).optional(),
  sells:         z.string().max(1000).optional(),
  objections:    z.array(z.string().max(200)).max(10).optional(),
  extra_context: z.string().max(2000).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "No fields provided" });

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = VoiceSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues?.[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const fields = {
    ...raw,
    ...(raw.tone          !== undefined && { tone:          sanitizeText(raw.tone) }),
    ...(raw.offer         !== undefined && { offer:         sanitizeText(raw.offer) }),
    ...(raw.price_range   !== undefined && { price_range:   sanitizeText(raw.price_range) }),
    ...(raw.sells         !== undefined && { sells:         sanitizeText(raw.sells) }),
    ...(raw.extra_context !== undefined && { extra_context: sanitizeText(raw.extra_context) }),
    ...(raw.objections    !== undefined && { objections:    raw.objections.map(sanitizeText) }),
  };

  const now = new Date().toISOString();
  const service = createServiceClient();

  const { data: existing } = await service
    .from("voice_profiles")
    .select("id")
    .eq("org_id", params.orgId)
    .single();

  let result;
  if (existing) {
    result = await service
      .from("voice_profiles")
      .update({ ...fields, updated_at: now })
      .eq("org_id", params.orgId)
      .select("*")
      .single();
  } else {
    result = await service
      .from("voice_profiles")
      .insert({ org_id: params.orgId, ...fields, updated_at: now })
      .select("*")
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  void logAudit(service, params.orgId, user.id, "voice.update", {
    updated_fields: Object.keys(fields),
  });
  return NextResponse.json({ voiceProfile: result.data });
}
