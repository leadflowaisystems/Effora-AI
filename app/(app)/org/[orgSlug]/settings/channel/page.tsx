export const dynamic = "force-dynamic";

/**
 * /org/[slug]/settings/channel — Channel integrations
 * Instagram: disabled (Meta API approval required) with tooltip explanation.
 * ManyChat: links to /settings/channel/manychat with webhook setup.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Instagram, Zap, CheckCircle2, ArrowRight } from "lucide-react";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "Channels — Effora AI" };

export default async function ChannelSettingsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  const svc = createServiceClient();
  const { data: intRows } = await svc
    .from("integrations").select("provider, active").eq("org_id", org.id);

  const intMap = Object.fromEntries(
    ((intRows ?? []) as { provider: string; active: boolean }[]).map((r) => [r.provider, r])
  );

  const manyChatConnected = !!(intMap["manychat"]?.active);
  const instagramConnected = !!(intMap["meta_instagram"]?.active);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/org/${params.orgSlug}/settings`}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Settings
        </Link>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Channels</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Connect your DM channels so Effora AI can receive and reply to leads automatically.
        </p>
      </div>

      <div className="space-y-3">
        {/* ── Instagram — Connect via Meta OAuth ── */}
        <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${instagramConnected ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "bg-[var(--bg-3)] text-[var(--text-3)]"}`}>
              <Instagram className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Instagram DMs</p>
              <p className="text-xs text-[var(--text-3)] mt-0.5">
                {instagramConnected
                  ? "Connected — DMs sync automatically via Meta Graph API."
                  : "Connect your Instagram Business account via Meta OAuth."}
              </p>
            </div>
          </div>
          {instagramConnected ? (
            <Link
              href={`/org/${params.orgSlug}/settings/channel/instagram`}
              className="shrink-0 flex items-center gap-1 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-3 py-1.5 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand)]/12 transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" /> Manage
            </Link>
          ) : (
            <Link
              href={`/org/${params.orgSlug}/settings/channel/instagram`}
              className="shrink-0 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:border-[var(--brand)]/40 transition-colors"
            >
              Connect <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* ── ManyChat — links to setup page ── */}
        <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${manyChatConnected ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "bg-[var(--bg-3)] text-[var(--brand)]"}`}>
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text)]">ManyChat</p>
              <p className="text-xs text-[var(--text-3)]">
                {manyChatConnected
                  ? "Webhook active — ManyChat is forwarding leads."
                  : "Forward subscriber messages to Effora AI via webhook."}
              </p>
            </div>
          </div>
          {manyChatConnected ? (
            <Link
              href={`/org/${params.orgSlug}/settings/channel/manychat`}
              className="shrink-0 flex items-center gap-1 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-3 py-1.5 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand)]/12 transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" /> Manage
            </Link>
          ) : (
            <Link
              href={`/org/${params.orgSlug}/settings/channel/manychat`}
              className="shrink-0 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:border-[var(--brand)]/40 transition-colors"
            >
              Connect <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Info note */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] p-3 space-y-1.5">
        <p className="text-xs text-[var(--text-2)] font-medium">Testing without a live channel?</p>
        <p className="text-xs text-[var(--text-3)] leading-relaxed">
          Open your <strong className="text-[var(--text-2)]">Inbox</strong> and click{" "}
          <strong className="text-[var(--text-2)]">+ New DM</strong> to simulate any inbound message
          end-to-end: AI qualifies the lead, scores it, and drafts a reply — no channel required.
        </p>
      </div>
    </div>
  );
}
