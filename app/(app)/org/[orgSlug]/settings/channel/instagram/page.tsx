export const dynamic = "force-dynamic";

/**
 * /org/[slug]/settings/channel/instagram
 *
 * Three sections:
 *   1. Connect Instagram Business — OAuth CTA
 *   2. Auto-refresh tokens — shows token expiry status
 *   3. Webhook status — last 10 events received from Meta
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Instagram, CheckCircle2, AlertCircle, RefreshCw, Activity,
} from "lucide-react";
import { InstagramConnectClient } from "./instagram-client";

interface Props {
  params:      { orgSlug: string };
  searchParams: { connected?: string; error?: string };
}

export const metadata = { title: "Instagram — Effora AI" };

export default async function InstagramSettingsPage({ params, searchParams }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  const svc = createServiceClient();

  // Load integration
  const { data: intRow } = await svc
    .from("integrations")
    .select("config, active")
    .eq("org_id", org.id)
    .eq("provider", "meta_instagram")
    .maybeSingle();

  const cfg = intRow?.config as Record<string, string> | null;
  const isConnected = !!(intRow?.active && cfg?.ig_username);

  // Token expiry status
  let tokenDaysLeft: number | null = null;
  if (cfg?.token_expires_at) {
    const diff = new Date(cfg.token_expires_at).getTime() - Date.now();
    tokenDaysLeft = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  // Last 10 webhook events (webhook_events table added in migration 015)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = await (svc as any)
    .from("webhook_events")
    .select("id, event_type, sender_id, verified, created_at")
    .eq("org_id", org.id)
    .eq("provider", "meta_instagram")
    .order("created_at", { ascending: false })
    .limit(10);

  const webhookEvents = ((events as unknown[]) ?? []) as {
    id: string; event_type: string; sender_id: string | null;
    verified: boolean; created_at: string;
  }[];

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app";
  const connectUrl = `/api/auth/meta/connect?orgSlug=${params.orgSlug}`;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/org/${params.orgSlug}/settings/channel`}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Channels
        </Link>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">
          Instagram DMs
        </h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Connect your Instagram Business account to receive and reply to DMs directly in Effora AI.
        </p>
      </div>

      {/* Toast for connected/error query params */}
      <InstagramConnectClient
        connected={searchParams.connected === "1"}
        error={searchParams.error ?? null}
      />

      {/* ── Section 1: Connect ── */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${isConnected ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "bg-[var(--bg-3)] text-[var(--text-3)]"}`}>
            <Instagram className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Connect Instagram Business</p>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              {isConnected
                ? `Connected as @${cfg!.ig_username} · page: ${cfg!.page_name}`
                : "Link your Instagram Business account via Facebook OAuth."}
            </p>
          </div>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--brand)]/20 bg-[var(--brand)]/5 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--brand)] shrink-0" />
            <p className="text-xs text-[var(--brand)]">
              Instagram connected — DMs will sync automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-[var(--radius)] border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-400/90 leading-relaxed">
                <strong>Before you connect:</strong> Your Meta App must be submitted for review and
                approved by Meta (1–3 weeks). Until then you can connect your own Instagram account
                for testing in development mode.
              </p>
            </div>
            <Link
              href={connectUrl}
              className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <Instagram className="h-4 w-4" />
              Connect Instagram
            </Link>
          </div>
        )}

        {isConnected && (
          <div className="pt-1">
            <Link
              href={connectUrl}
              className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] underline-offset-2 hover:underline"
            >
              Reconnect or switch account
            </Link>
          </div>
        )}
      </div>

      {/* ── Section 2: Token auto-refresh ── */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-[var(--text-3)]" />
          <p className="text-sm font-medium text-[var(--text)]">Auto-refresh tokens</p>
        </div>
        <p className="text-xs text-[var(--text-3)] leading-relaxed">
          Meta access tokens expire after 60 days. Effora AI automatically refreshes them
          daily at 4 AM when they&apos;re within 7 days of expiry.
        </p>

        {isConnected && tokenDaysLeft !== null && (
          <div className={`flex items-center gap-2 rounded-[var(--radius)] border px-3 py-2 ${tokenDaysLeft <= 7 ? "border-amber-500/30 bg-amber-500/5" : "border-[var(--border)] bg-[var(--bg-2)]"}`}>
            {tokenDaysLeft <= 7
              ? <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              : <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand)] shrink-0" />}
            <p className={`text-xs ${tokenDaysLeft <= 7 ? "text-amber-400" : "text-[var(--text-3)]"}`}>
              {tokenDaysLeft <= 7
                ? `Token expires in ${tokenDaysLeft} days — will auto-refresh tonight.`
                : `Token valid for ${tokenDaysLeft} more days.`}
            </p>
          </div>
        )}

        {!isConnected && (
          <p className="text-xs text-[var(--text-3)] italic">Connect an account to see token status.</p>
        )}
      </div>

      {/* ── Section 3: Webhook debug ── */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--text-3)]" />
            <p className="text-sm font-medium text-[var(--text)]">Webhook status</p>
          </div>
          <span className="text-[10px] text-[var(--text-3)] font-mono">
            {appUrl}/api/webhooks/meta/instagram
          </span>
        </div>

        {webhookEvents.length === 0 ? (
          <p className="text-xs text-[var(--text-3)] italic">
            No webhook events received yet. Events appear here once Meta starts delivering messages.
          </p>
        ) : (
          <div className="space-y-1.5">
            {webhookEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ev.verified ? "bg-[var(--brand)]" : "bg-amber-400"}`} />
                  <span className="text-xs text-[var(--text-2)] truncate">{ev.event_type}</span>
                  {ev.sender_id && (
                    <span className="text-[10px] text-[var(--text-3)] truncate font-mono">
                      from {ev.sender_id}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[var(--text-3)] shrink-0 ml-2">
                  {new Date(ev.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-[var(--text-3)] leading-relaxed">
          Green dot = signature verified. Configure webhook in Meta Developer Console:
          Callback URL above, Verify Token from META_WEBHOOK_VERIFY_TOKEN env var.
          Subscribe to: <span className="font-mono">messages, messaging_postbacks, message_reads</span>
        </p>
      </div>
    </div>
  );
}
