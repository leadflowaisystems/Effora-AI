export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { VoiceProfileForm } from "./voice-form-client";
import { EmailPreview } from "@/components/settings/email-preview";

export async function generateMetadata() {
  return { title: "Voice profile — Effora AI" };
}

export default async function VoiceSettingsPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgData } = await supabase
    .from("orgs")
    .select("id, name")
    .eq("slug", params.orgSlug)
    .single();

  const org = orgData as { id: string; name: string } | null;
  if (!org) notFound();

  // Load existing voice profile and deep context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;
  const [voiceResult, deepCtxResult] = await Promise.all([
    service.from("voice_profiles").select("*").eq("org_id", org.id).single(),
    service.from("orgs").select("deep_context").eq("id", org.id).single(),
  ]);

  const voiceData = voiceResult.data;
  const voice = voiceData as {
    tone: string;
    offer: string;
    price_range: string;
    sells: string;
    objections: string[];
    extra_context: string;
  } | null;

  const deepContext = (deepCtxResult.data as { deep_context: Record<string,unknown> | null } | null)?.deep_context ?? {};

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">
          Voice profile
        </h1>
        <p className="text-sm text-[var(--text-3)] mt-1">
          How the AI speaks as you — for {org.name}.
        </p>
      </div>

      <VoiceProfileForm
        orgId={org.id}
        orgSlug={params.orgSlug}
        initial={voice}
        initialDeepContext={deepContext}
      />

      {/* Email preview + test send */}
      <div className="border-t border-[var(--border)] pt-6 space-y-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">Email templates</h2>
        <p className="text-xs text-[var(--text-3)]">
          Preview what your leads receive and send a test to your inbox.
        </p>
        <EmailPreview orgId={org.id} userEmail={user.email ?? undefined} />
      </div>
    </div>
  );
}
