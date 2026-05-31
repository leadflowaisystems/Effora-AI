/**
 * /c/[coachSlug] — Public coach funnel page. No auth required.
 * Leads fill in name, Instagram handle, goal → creates lead in Effora AI.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Zap } from "lucide-react";
import { FunnelForm } from "./funnel-form";

interface Props { params: { coachSlug: string } }

export async function generateMetadata({ params }: Props) {
  const svc = createServiceClient();
  const { data: orgRow } = await svc
    .from("orgs").select("name").eq("slug", params.coachSlug).single();
  const name = (orgRow as { name: string } | null)?.name ?? "Coach";
  return { title: `Work with ${name}` };
}

export default async function CoachFunnelPage({ params }: Props) {
  const svc = createServiceClient();

  const orgRow = (await svc.from("orgs").select("id, name, slug").eq("slug", params.coachSlug).single()).data as { id: string; name: string; slug: string } | null;
  if (!orgRow) notFound();

  const { data: cfgData } = await svc
    .from("funnel_configs")
    .select("headline, subheadline, offer_desc, cta_text, photo_url, video_url, pricing_teaser, published")
    .eq("org_id", orgRow.id)
    .maybeSingle();

  const config = cfgData as {
    headline: string; subheadline: string; offer_desc: string; cta_text: string;
    photo_url: string | null; video_url: string | null; pricing_teaser: string | null;
    published: boolean;
  } | null;

  // If no config or not published, show a basic default
  const headline    = config?.headline    || `Work with ${orgRow.name}`;
  const subheadline = config?.subheadline || "Serious about results? Let's talk.";
  const offerDesc   = config?.offer_desc  || "";
  const ctaText     = config?.cta_text    || "Apply to work with me";
  const photoUrl    = config?.photo_url   || null;
  const videoUrl    = config?.video_url   || null;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Header */}
      <nav className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/90 px-6 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[var(--brand)]" />
          <span className="font-display font-bold text-sm">{orgRow.name}</span>
        </div>
        <span className="text-xs text-[var(--text-3)]">Powered by Effora AI</span>
      </nav>

      <div className="mx-auto max-w-lg px-6 py-12 space-y-10">
        {/* Coach profile */}
        <div className="text-center space-y-4">
          {photoUrl && (
            <img
              src={photoUrl}
              alt={orgRow.name}
              className="mx-auto h-20 w-20 rounded-full object-cover border-2 border-[var(--brand)]/40"
            />
          )}
          <div>
            <h1 className="font-display text-3xl font-bold text-[var(--text)] leading-tight">
              {headline}
            </h1>
            {subheadline && (
              <p className="mt-2 text-[var(--text-3)] leading-relaxed">{subheadline}</p>
            )}
          </div>
          {offerDesc && (
            <div className="text-left rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-4">
              <p className="text-sm text-[var(--text-2)] leading-relaxed whitespace-pre-line">{offerDesc}</p>
            </div>
          )}
          {videoUrl && (
            <div className="rounded-[var(--radius-lg)] overflow-hidden border border-[var(--border)]">
              <iframe
                src={videoUrl.replace("watch?v=", "embed/")}
                className="w-full aspect-video"
                allowFullScreen
              />
            </div>
          )}
        </div>

        {/* Form */}
        <FunnelForm
          orgId={orgRow.id}
          orgName={orgRow.name}
          ctaText={ctaText}
        />
      </div>
    </div>
  );
}
