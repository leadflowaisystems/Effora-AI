/**
 * /org/[slug]/inbox/[convId]
 *
 * Thin server shell — only does auth + org-id lookup (2 fast queries).
 * All message/draft fetching happens client-side in <ThreadPage> so
 * navigation between conversations feels instant.
 */

import { redirect, notFound } from "next/navigation";
import { createClient }       from "@/lib/supabase/server";
import { ThreadPage }         from "@/components/inbox/thread-page";

interface Props {
  params: { orgSlug: string; convId: string };
}

export async function generateMetadata() {
  return { title: `Conversation — Effora AI` };
}

export default async function ConversationPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id")
    .eq("slug", params.orgSlug).single();

  if (!orgRow) notFound();

  return (
    <ThreadPage
      orgId={(orgRow as { id: string }).id}
      convId={params.convId}
      orgSlug={params.orgSlug}
    />
  );
}
