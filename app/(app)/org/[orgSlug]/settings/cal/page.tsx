export const dynamic = "force-dynamic";

/**
 * /org/[slug]/settings/cal — Cal.com integration
 * Let coaches paste their Cal.com booking link.
 * The AI includes this link in reply drafts for hot leads.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CalSettingsForm } from "./cal-form-client";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "Booking (Cal.com) — Effora AI" };

export default async function CalSettingsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  const svc = createServiceClient();
  const { data: intRow } = await svc
    .from("integrations")
    .select("config")
    .eq("org_id", org.id)
    .eq("provider", "calcom")
    .maybeSingle();

  // Only the PRESENCE of the webhook secret crosses to the client — never the
  // value, encrypted or otherwise. `webhook_secret` is the legacy plaintext key
  // still present on older rows; `webhook_secret_enc` is what the integrations
  // route writes today.
  const config = (intRow?.config ?? {}) as {
    cal_link?: string;
    webhook_secret_enc?: string;
    webhook_secret?: string;
  };

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
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Booking (Cal.com)</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Add your Cal.com link and the AI will include it automatically when replying to hot leads.
        </p>
      </div>

      <CalSettingsForm
        orgId={org.id}
        orgSlug={params.orgSlug}
        initialCalLink={config.cal_link ?? ""}
        hasWebhookSecret={!!(config.webhook_secret_enc || config.webhook_secret)}
      />
    </div>
  );
}
