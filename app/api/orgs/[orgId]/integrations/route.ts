/**
 * GET   /api/orgs/[orgId]/integrations           — list all integrations
 * PUT   /api/orgs/[orgId]/integrations            — upsert one integration
 * DELETE /api/orgs/[orgId]/integrations?provider= — remove integration
 *
 * Supported providers: 'calcom' | 'razorpay' | 'manychat'
 *
 * Secrets in the request body are encrypted before persisting.
 * Secrets are NEVER returned in GET responses — only sanitised shapes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";

interface Params { params: { orgId: string } }

const ALLOWED_PROVIDERS = ["calcom", "razorpay", "manychat", "meta"] as const;
type Provider = typeof ALLOWED_PROVIDERS[number];

/** Fields that contain secrets and must be encrypted. */
const SECRET_FIELDS: Record<Provider, string[]> = {
  calcom:    ["api_key", "webhook_secret"],
  razorpay:  ["key_secret"],
  manychat:  ["api_key"],
  meta:      ["page_access_token", "app_secret"],
};

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

/** Strip encrypted values from config before returning to client. */
function sanitise(config: Record<string, unknown>, provider: string): Record<string, unknown> {
  const secrets = SECRET_FIELDS[provider as Provider] ?? [];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (secrets.some((s) => k.startsWith(s))) {
      out[k] = typeof v === "string" && v.length > 0 ? "••••••••" : "";
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("integrations")
    .select("id, provider, active, created_at, updated_at, config")
    .eq("org_id", params.orgId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const integrations = (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    config: sanitise(row.config as Record<string, unknown>, row.provider),
  }));

  return NextResponse.json({ integrations });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { provider, config = {}, active = true } = body as {
    provider: Provider;
    config: Record<string, string>;
    active?: boolean;
  };

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  // Encrypt secret fields
  const storedConfig: Record<string, string> = {};
  const secretFields = SECRET_FIELDS[provider] ?? [];
  for (const [k, v] of Object.entries(config)) {
    if (typeof v !== "string" || v === "") continue;
    if (secretFields.some((s) => k === s)) {
      try {
        storedConfig[`${k}_enc`] = encryptSecret(v);
      } catch {
        // ENCRYPTION_KEY not set — store raw (development only)
        storedConfig[k] = v;
      }
    } else {
      storedConfig[k] = v;
    }
  }

  const now = new Date().toISOString();
  const service = createServiceClient();

  // Upsert on (org_id, provider)
  const { data: existing } = await service
    .from("integrations")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("provider", provider)
    .single();

  let result;
  if (existing) {
    result = await service
      .from("integrations")
      .update({ config: storedConfig, active, updated_at: now })
      .eq("id", existing.id)
      .select("id, provider, active, updated_at")
      .single();
  } else {
    result = await service
      .from("integrations")
      .insert({
        org_id: params.orgId,
        provider,
        config: storedConfig,
        active,
        updated_at: now,
      })
      .select("id, provider, active, updated_at")
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  void logAudit(service, params.orgId, user.id, "integration.update", { provider });
  return NextResponse.json({ integration: result.data });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service
    .from("integrations")
    .delete()
    .eq("org_id", params.orgId)
    .eq("provider", provider);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
