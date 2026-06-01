/**
 * GET  /api/orgs/[orgId]/integrations/whatsapp-cloud — get status
 * POST /api/orgs/[orgId]/integrations/whatsapp-cloud — validate token + save
 */

import { NextRequest, NextResponse }        from "next/server";
import { createClient }                     from "@/lib/supabase/server";
import { saveWhatsAppIntegration, validateWhatsAppToken } from "@/lib/integrations/whatsapp-cloud";
import { createServiceClient }              from "@/lib/supabase/server";

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

  const svc = createServiceClient();
  const { data } = await svc
    .from("integrations")
    .select("active, config")
    .eq("org_id", params.orgId)
    .eq("provider", "whatsapp_cloud")
    .maybeSingle();

  if (!data?.active) return NextResponse.json({ integration: null });

  const cfg = data.config as Record<string, string>;
  return NextResponse.json({
    integration: {
      active:               true,
      display_phone_number: cfg.display_phone_number ?? "",
      waba_id:              cfg.waba_id ?? "",
    },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    waba_id?:              string;
    phone_number_id?:      string;
    access_token?:         string;
    display_phone_number?: string;
  };

  if (!body.waba_id || !body.phone_number_id || !body.access_token) {
    return NextResponse.json({ error: "waba_id, phone_number_id, and access_token are required" }, { status: 400 });
  }

  // Validate token before saving
  const validation = await validateWhatsAppToken(body.phone_number_id, body.access_token);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error ?? "Invalid access token or phone number ID. Check your Meta credentials." },
      { status: 400 }
    );
  }

  const displayPhone = validation.display_phone_number ?? body.display_phone_number ?? body.phone_number_id;

  await saveWhatsAppIntegration(
    params.orgId,
    body.waba_id,
    body.phone_number_id,
    body.access_token,
    displayPhone,
  );

  return NextResponse.json({ ok: true, display_phone_number: displayPhone });
}
