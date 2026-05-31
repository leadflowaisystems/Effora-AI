/**
 * /org/[slug]/settings/whatsapp
 * WhatsApp Business Click-to-Chat URL generator + QR code.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { WhatsAppClient } from "./whatsapp-client";
import { WhatsAppCloudClient } from "./whatsapp-cloud-client";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "WhatsApp — Effora AI" };

export default async function WhatsAppPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase.from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  const svc = createServiceClient();
  const [ctcResult, cloudResult] = await Promise.all([
    svc.from("integrations").select("config, active").eq("org_id", org.id).eq("provider", "whatsapp").maybeSingle(),
    svc.from("integrations").select("config, active").eq("org_id", org.id).eq("provider", "whatsapp_cloud").maybeSingle(),
  ]);

  const config      = ((ctcResult.data?.config ?? {}) as { number?: string; greeting?: string });
  const cloudCfg    = ((cloudResult.data?.config ?? {}) as { display_phone_number?: string });
  const cloudActive = !!cloudResult.data?.active;

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Link href={`/org/${params.orgSlug}/settings`}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Settings
        </Link>
      </div>

      {/* WhatsApp Cloud API — real-time inbox */}
      <div className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">WhatsApp Cloud API</h2>
        <p className="text-sm text-[var(--text-3)]">
          Real-time inbox: receive and reply to WhatsApp messages directly from Effora AI. Free for first 1,000 conversations/month via Meta.
        </p>
      </div>
      <WhatsAppCloudClient
        orgId={org.id}
        isConnected={cloudActive}
        displayPhone={cloudCfg.display_phone_number}
      />

      {/* Divider */}
      <div className="border-t border-[var(--border)]" />

      {/* Click-to-Chat — no API needed */}
      <div className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">Click-to-Chat Link</h2>
        <p className="text-sm text-[var(--text-3)]">
          Generate a wa.me link that opens a pre-filled WhatsApp chat. No API, no approval needed.
        </p>
      </div>
      <WhatsAppClient
        orgId={org.id}
        orgSlug={params.orgSlug}
        initialNumber={config.number ?? ""}
        initialGreeting={config.greeting ?? `Hi! I saw your content on Instagram and I'm interested in coaching.`}
        isActive={!!ctcResult.data?.active}
      />
    </div>
  );
}
