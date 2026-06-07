export const dynamic = "force-dynamic";

/**
 * /org/[orgSlug]/manychats
 *
 * ManyChats management hub — 4 tabs:
 *   1. Overview        — channel connection status
 *   2. Setup Guide     — step-by-step Instagram / WhatsApp / ManyChat guides
 *   3. Health          — read-only diagnostics (connection, last messages)
 *   4. Automation Intake — questionnaire saved to automation_intake table
 *
 * IMPORTANT: This page only READS existing integration data.
 * It does NOT modify any messaging, delivery, webhook, or auth logic.
 */

import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ManychatsClient } from "./manychats-client";

interface Props { params: { orgSlug: string } }

export async function generateMetadata() {
  return { title: "ManyChats — Effora AI" };
}

export default async function ManychatsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app";
  const funnelUrl  = `${appUrl}/c/${params.orgSlug}`;
  const handoffUrl = `${appUrl}/api/webhooks/manychat-handoff/${org.id}`;

  // ── Load all needed data in parallel ──────────────────────────────────────
  const [intRows, calRow, mcRow, lastMsgsRes, intakeRes] = await Promise.all([
    svc.from("integrations")
       .select("provider, active, config, updated_at")
       .eq("org_id", org.id),

    svc.from("integrations")
       .select("config")
       .eq("org_id", org.id).eq("provider", "calcom").eq("active", true)
       .maybeSingle(),

    svc.from("integrations")
       .select("config, active")
       .eq("org_id", org.id).eq("provider", "manychat")
       .maybeSingle(),

    // Last incoming + outgoing messages per channel provider
    svc.from("messages")
       .select("direction, sent_at, channel_provider")
       .eq("org_id", org.id)
       .order("sent_at", { ascending: false })
       .limit(100),

    svc.from("automation_intake")
       .select("*")
       .eq("org_id", org.id)
       .maybeSingle(),
  ]);

  type IntRow = { provider: string; active: boolean; config: Record<string, string>; updated_at: string };
  const intMap = Object.fromEntries(
    ((intRows.data ?? []) as IntRow[]).map((r) => [r.provider, r])
  ) as Record<string, IntRow | undefined>;

  const calUrl      = ((calRow.data?.config as Record<string, string> | null)?.booking_url) ?? "";
  const webhookToken = ((mcRow.data?.config as Record<string, string> | null)?.webhook_token) ?? "";

  // ── Build integration status objects (read-only) ──────────────────────────
  const igRow  = intMap["meta_instagram"];
  const waRow  = intMap["whatsapp_cloud"];
  const mcIntRow = intMap["manychat"];

  const instagram = {
    connected: !!igRow?.active,
    label:     igRow?.active ? "Connected" : "Not connected",
    detail:    igRow?.active
      ? (igRow.config?.ig_username ? `@${igRow.config.ig_username}` : "Instagram Business connected")
      : "Connect your Instagram Business account via Meta OAuth.",
    updatedAt: igRow?.updated_at,
  };

  const whatsapp = {
    connected: !!waRow?.active,
    label:     waRow?.active ? "Connected" : "Not connected",
    detail:    waRow?.active
      ? (waRow.config?.display_phone_number
          ? `Cloud API active · ${waRow.config.display_phone_number}`
          : "WhatsApp Cloud API connected")
      : "Paste your WABA credentials in Settings › WhatsApp.",
    updatedAt: waRow?.updated_at,
  };

  const manychat = {
    connected:  !!mcIntRow?.active,
    label:      mcIntRow?.active ? "Webhook active" : "Free tier available",
    detail:     mcIntRow?.active
      ? "ManyChat webhook configured — forwarding leads to Effora AI."
      : "Story replies, comment triggers, keyword DMs — all free.",
    updatedAt:  mcIntRow?.updated_at,
  };

  // ── Build health entries ──────────────────────────────────────────────────
  type MsgRow = { direction: string; sent_at: string; channel_provider: string };
  const msgs = (lastMsgsRes.data ?? []) as MsgRow[];

  function lastMsg(provider: string, direction: "inbound" | "outbound") {
    const row = msgs.find((m) => m.channel_provider === provider && m.direction === direction);
    return row?.sent_at ?? null;
  }

  const health = [
    {
      name:         "Instagram DMs",
      connected:    instagram.connected,
      lastIncoming: lastMsg("instagram", "inbound"),
      lastOutgoing: lastMsg("instagram", "outbound"),
      webhookNote:  "Webhook events are delivered by Meta's Graph API. Token refresh is handled automatically.",
    },
    {
      name:         "WhatsApp Business",
      connected:    whatsapp.connected,
      lastIncoming: lastMsg("whatsapp_cloud", "inbound"),
      lastOutgoing: lastMsg("whatsapp_cloud", "outbound"),
      webhookNote:  "Messages are delivered via WhatsApp Cloud API. Verify your webhook in Meta Developer Console.",
    },
    {
      name:         "ManyChat Webhook",
      connected:    manychat.connected,
      lastIncoming: null,
      lastOutgoing: null,
      webhookNote:  "ManyChat POSTs leads to your handoff URL. No inbound/outbound message log for ManyChat flows.",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">ManyChats</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Manage your channel connections, guides, health diagnostics, and automation preferences.
        </p>
      </div>

      <ManychatsClient
        orgSlug={params.orgSlug}
        orgId={org.id}
        funnelUrl={funnelUrl}
        calUrl={calUrl}
        handoffUrl={handoffUrl}
        webhookToken={webhookToken}
        instagram={instagram}
        whatsapp={whatsapp}
        manychat={manychat}
        health={health}
        intake={intakeRes.data ?? null}
      />
    </div>
  );
}
