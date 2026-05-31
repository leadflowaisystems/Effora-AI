/**
 * /org/[slug]/settings/funnel — configure the public lead-capture page at /c/[slug].
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { FunnelSettingsForm } from "./funnel-settings-form";

interface Props { params: { orgSlug: string } }
export const metadata = { title: "Funnel Page — Effora AI" };

export default async function FunnelSettingsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase.from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  const svc = createServiceClient();
  const { data: cfgRow } = await svc.from("funnel_configs").select("*").eq("org_id", org.id).maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai.vercel.app";
  const publicUrl = `${appUrl}/c/${params.orgSlug}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${params.orgSlug}/settings`}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Settings
        </Link>
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Funnel page</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Your public lead-capture page. Add it to your Instagram bio.
        </p>
      </div>
      <FunnelSettingsForm
        orgId={org.id}
        orgSlug={params.orgSlug}
        publicUrl={publicUrl}
        initial={cfgRow as Record<string, unknown> | null}
      />
    </div>
  );
}
