export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { TemplatesClient } from "./templates-client";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "WhatsApp Templates — Effora AI" };

export default async function WhatsAppTemplatesPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase.from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tplRows } = await (svc as any).from("whatsapp_templates")
    .select("id, name, category, body, variables, approval_status, created_at")
    .eq("org_id", org.id).order("created_at", { ascending: false });

  const templates = (tplRows ?? []) as Array<{
    id: string; name: string; category: string; body: string;
    variables: string[]; approval_status: string; created_at: string;
  }>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${params.orgSlug}/settings/whatsapp`}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> WhatsApp
        </Link>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Message Templates</h1>
        <p className="text-sm text-[var(--text-3)] mt-1">
          Create templates for broadcasts and out-of-window messages. Requires Meta approval (24–72 hours).
        </p>
      </div>

      <TemplatesClient orgId={org.id} orgSlug={params.orgSlug} initialTemplates={templates} />
    </div>
  );
}
