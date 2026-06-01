export const dynamic = "force-dynamic";

/**
 * /org/[slug]/settings/channel/manychat
 * Guides coaches to use ManyChat free triggers to send leads to Effora AI funnel URL.
 * No External Request, webhook, or paid ManyChat plan required.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ManyChatSetupClient } from "./manychat-client";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "ManyChat — Effora AI" };

export default async function ManyChatSetupPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  const svc = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai-qh35.vercel.app";
  const funnelUrl = `${appUrl}/c/${params.orgSlug}`;

  // Load Cal.com URL if connected
  const { data: calRow } = await svc
    .from("integrations").select("config")
    .eq("org_id", org.id).eq("provider", "calcom").eq("active", true).maybeSingle();
  const calUrl = ((calRow?.config as Record<string, string> | null)?.booking_url) ?? "";

  // Load manychat webhook token for handoff section
  const { data: mcRow } = await svc
    .from("integrations").select("config, active")
    .eq("org_id", org.id).eq("provider", "manychat").maybeSingle();
  const webhookToken = ((mcRow?.config as Record<string, string> | null)?.webhook_token) ?? "";
  const handoffUrl = `${appUrl}/api/webhooks/manychat-handoff/${org.id}`;

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
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">ManyChat</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Use ManyChat free to capture leads from stories, comments, and keyword DMs.
        </p>
      </div>

      <ManyChatSetupClient
        orgSlug={params.orgSlug}
        funnelUrl={funnelUrl}
        calUrl={calUrl}
        handoffUrl={handoffUrl}
        webhookToken={webhookToken}
      />
    </div>
  );
}
