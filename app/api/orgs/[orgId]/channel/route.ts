/**
 * GET  /api/orgs/[orgId]/channel  — read active channel + config
 * PATCH /api/orgs/[orgId]/channel — set channel provider + store creds
 *
 * For 'manual': no credentials needed, just sets active_channel.
 * For 'manychat'/'meta': encrypts the API key before storing in channel_config.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { getAllProviders } from "@/lib/channel/registry";
import type { ChannelId } from "@/lib/channel/types";

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
  const { data, error } = await service
    .from("orgs")
    .select("active_channel, channel_config")
    .eq("id", params.orgId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    activeChannel: data.active_channel,
    channelConfig: data.channel_config,
    // Return provider metadata without exposing secrets
    providers: getAllProviders().map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      logoInitials: p.logoInitials,
      requiresSetup: p.requiresSetup,
      isLive: p.isLive,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { channel, settings = {} } = body as {
    channel: ChannelId;
    settings?: Record<string, string>;
  };

  const valid: ChannelId[] = ["manual", "manychat", "meta"];
  if (!valid.includes(channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  // Encrypt any secret fields the caller supplied
  const encryptedSettings: Record<string, string> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (v) {
      try {
        encryptedSettings[k] = encryptSecret(v);
      } catch {
        // ENCRYPTION_KEY not set — fine for manual channel
        encryptedSettings[k] = v;
      }
    }
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("orgs")
    .update({
      active_channel: channel,
      channel_config: { provider: channel, settings: encryptedSettings },
    })
    .eq("id", params.orgId)
    .select("active_channel, channel_config")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activeChannel: data.active_channel });
}
