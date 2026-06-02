export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { BroadcastClient } from "./broadcast-client";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "Broadcast — Effora AI" };

export default async function BroadcastPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase.from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  const svc = createServiceClient();

  // Check WhatsApp connection
  const { data: waRow } = await svc.from("integrations").select("active, config")
    .eq("org_id", org.id).eq("provider", "whatsapp_cloud").maybeSingle();
  const waConnected = !!waRow?.active;

  // Load approved templates (cast to any — whatsapp_templates not yet in generated DB types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tplRows } = await (svc as any).from("whatsapp_templates").select("id, name, body, variables, approval_status")
    .eq("org_id", org.id).eq("approval_status", "approved").order("name");
  const templates = (tplRows ?? []) as Array<{ id: string; name: string; body: string; variables: string[]; approval_status: string }>;

  // Load tags (from leads metadata) for recipient filtering — get distinct tags
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tagLeads } = await (svc as any).from("leads").select("id, name, phone, stage, tags")
    .eq("org_id", org.id).is("deleted_at", null).not("phone", "is", null).limit(500);
  const leads = (tagLeads ?? []) as Array<{ id: string; name: string | null; phone: string | null; stage: string; tags?: string[] }>;

  // Collect distinct tags
  const allTags = Array.from(new Set(leads.flatMap((l) => l.tags ?? []))).sort();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${params.orgSlug}`}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Broadcast</h1>
        <p className="text-sm text-[var(--text-3)] mt-1">
          Send WhatsApp template messages to multiple leads at once.
        </p>
      </div>

      {/* Policy banner */}
      <div className="flex items-start gap-2.5 rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-medium text-amber-400">WhatsApp policy</p>
          <p className="text-xs text-amber-400/80 leading-relaxed">
            Outside the 24-hour conversation window, only Meta-approved template messages can be sent.
            Free-form broadcasts will fail for leads who haven&apos;t messaged you recently.
            Template approval takes 24–72 hours — <Link href={`/org/${params.orgSlug}/settings/whatsapp/templates`} className="underline underline-offset-2">manage templates here</Link>.
          </p>
        </div>
      </div>

      {!waConnected ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6 text-center space-y-3">
          <p className="text-sm text-[var(--text-3)]">WhatsApp Cloud API is not connected.</p>
          <Link
            href={`/org/${params.orgSlug}/settings/whatsapp`}
            className="inline-flex rounded-[var(--radius)] bg-[var(--brand)] text-[#0A0A0C] text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
          >
            Connect WhatsApp
          </Link>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6 text-center space-y-3">
          <p className="text-sm font-medium text-[var(--text)]">No approved templates yet</p>
          <p className="text-xs text-[var(--text-3)]">
            Create and submit templates for Meta approval before broadcasting.
          </p>
          <Link
            href={`/org/${params.orgSlug}/settings/whatsapp/templates`}
            className="inline-flex rounded-[var(--radius)] bg-[var(--brand)] text-[#0A0A0C] text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
          >
            Manage Templates
          </Link>
        </div>
      ) : (
        <BroadcastClient
          orgId={org.id}
          orgSlug={params.orgSlug}
          templates={templates}
          leads={leads}
          allTags={allTags}
        />
      )}
    </div>
  );
}
