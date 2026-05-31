/**
 * /org/[slug]/settings/whatsapp
 * WhatsApp Business Click-to-Chat URL generator + QR code.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { WhatsAppClient } from "./whatsapp-client";

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
  const { data: intRow } = await svc
    .from("integrations").select("config, active")
    .eq("org_id", org.id).eq("provider", "whatsapp").maybeSingle();

  const config = (intRow?.config ?? {}) as { number?: string; greeting?: string };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${params.orgSlug}/settings`}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Settings
        </Link>
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">WhatsApp Click-to-Chat</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Generate a wa.me link that opens a pre-filled WhatsApp chat. No API, no approval needed.
        </p>
      </div>
      <WhatsAppClient
        orgId={org.id}
        orgSlug={params.orgSlug}
        initialNumber={config.number ?? ""}
        initialGreeting={config.greeting ?? `Hi! I saw your content on Instagram and I'm interested in coaching.`}
        isActive={!!intRow?.active}
      />
    </div>
  );
}
