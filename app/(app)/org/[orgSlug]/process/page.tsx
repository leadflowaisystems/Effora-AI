import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ReplyAssistant } from "@/components/assistant/reply-assistant";

export async function generateMetadata() {
  return { title: "AI Reply Assistant — Effora AI" };
}

interface Props { params: { orgSlug: string } }

export default async function AssistantPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id")
    .eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string };

  const svc = createServiceClient();
  const { data: calRow } = await svc
    .from("integrations").select("config")
    .eq("org_id", org.id).eq("provider", "calcom").eq("active", true).maybeSingle();
  const calLink = ((calRow?.config as Record<string,string> | null)?.booking_url) ?? null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai.vercel.app";
  const funnelUrl = `${appUrl}/c/${params.orgSlug}`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">AI Reply Assistant</h1>
        <p className="text-sm text-[var(--text-3)]">
          Paste any DM. Get 3 reply options. Copy your favourite.
        </p>
      </div>
      <ReplyAssistant orgId={org.id} orgSlug={params.orgSlug} calLink={calLink} funnelUrl={funnelUrl} />
    </div>
  );
}
