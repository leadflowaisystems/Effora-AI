export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getAccessState } from "@/lib/access";
import { TrendsView } from "@/components/trends/trends-view";
import { Lock } from "lucide-react";
import Link from "next/link";

export async function generateMetadata() {
  return { title: "Trends — Effora AI" };
}

interface Props { params: { orgSlug: string } }

export default async function TrendsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase.from("orgs").select("id").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string };

  const access = await getAccessState(org.id);

  if (!access.canUseTrends) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Trends</h1>
          <p className="text-sm text-[var(--text-3)]">Deep analytics across 30/60/90 days with AI insights.</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-3)]">
            <Lock className="h-7 w-7 text-[var(--text-3)]" />
          </div>
          <div className="space-y-2 max-w-xs">
            <p className="font-display text-base font-semibold text-[var(--text)]">Pro feature</p>
            <p className="text-sm text-[var(--text-3)]">Trend analysis is available on the Pro plan. Upgrade to unlock 90-day charts, cohort analysis, and AI insights.</p>
            <Link href={`/org/${params.orgSlug}/settings/billing`}
              className="inline-block mt-2 rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 transition-opacity">
              Upgrade to Pro
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const svc   = createServiceClient();
  const since = new Date(Date.now() - 90 * 86400000).toISOString();

  const [leadsRes, bookingsRes, paymentsRes] = await Promise.all([
    svc.from("leads").select("created_at, source, stage").eq("org_id", org.id).gte("created_at", since).limit(2000),
    svc.from("bookings").select("created_at, status, starts_at").eq("org_id", org.id).gte("created_at", since).limit(1000),
    svc.from("payments").select("created_at, status, amount_inr").eq("org_id", org.id).is("deleted_at", null).gte("created_at", since).limit(1000),
  ]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Trends</h1>
        <p className="text-sm text-[var(--text-3)]">90-day performance analysis with AI insights.</p>
      </div>
      <TrendsView
        orgId={org.id}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        leads={(leadsRes.data ?? []) as any[]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bookings={(bookingsRes.data ?? []) as any[]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payments={(paymentsRes.data ?? []) as any[]}
      />
    </div>
  );
}
