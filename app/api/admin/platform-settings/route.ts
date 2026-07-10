/**
 * GET  /api/admin/platform-settings — load current platform settings (secret masked)
 * PUT  /api/admin/platform-settings — save Meta app credentials
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { encryptSecret } from "@/lib/crypto";

async function assertAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET() {
  if (!await assertAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (svc as any)
    .from("platform_settings")
    .select("meta_app_id, meta_webhook_verify_token, meta_app_mode, last_verified_at, updated_at")
    .eq("id", 1)
    .maybeSingle();

  return NextResponse.json({ settings: data ?? null });
}

export async function PUT(req: NextRequest) {
  if (!await assertAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    meta_app_id?:               string;
    meta_app_secret?:           string;
    meta_webhook_verify_token?: string;
    meta_app_mode?:             string;
  };

  if (!body.meta_app_id) {
    return NextResponse.json({ error: "meta_app_id is required" }, { status: 400 });
  }

  // Verify app ID is valid by calling Graph API
  let verifiedAt: string | null = null;
  try {
    const verifyRes = await fetch(
      `https://graph.facebook.com/v23.0/${body.meta_app_id}?access_token=${body.meta_app_id}|${body.meta_app_secret ?? ""}`,
    );
    if (verifyRes.ok) {
      verifiedAt = new Date().toISOString();
    }
  } catch {
    // Non-fatal — save anyway
  }

  const svc = createServiceClient();
  const row: Record<string, unknown> = {
    id:                          1,
    meta_app_id:                 body.meta_app_id,
    meta_webhook_verify_token:   body.meta_webhook_verify_token ?? null,
    meta_app_mode:               body.meta_app_mode ?? "dev",
    updated_at:                  new Date().toISOString(),
  };
  if (verifiedAt) row.last_verified_at = verifiedAt;

  // Only overwrite secret if a new one was provided
  if (body.meta_app_secret) {
    row.meta_app_secret_encrypted = encryptSecret(body.meta_app_secret);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any)
    .from("platform_settings")
    .upsert(row, { onConflict: "id" });

  if (error) {
    console.error("[platform-settings PUT]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, verified: !!verifiedAt });
}
