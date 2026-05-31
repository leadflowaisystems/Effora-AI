/**
 * /org/[slug]/settings/payments — Razorpay integration (per-org collection)
 * Coaches connect their own Razorpay account to collect coaching fees.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { RazorpaySettingsForm } from "./razorpay-form-client";
import { UpiIdForm } from "./upi-id-form-client";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "Payments (Razorpay) — Effora AI" };

export default async function PaymentsSettingsPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs").select("id, name").eq("slug", params.orgSlug).single();
  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const [intRow, orgData] = await Promise.all([
    svc.from("integrations").select("config, active").eq("org_id", org.id).eq("provider", "razorpay").maybeSingle(),
    svc.from("orgs").select("upi_id").eq("id", org.id).single(),
  ]);

  const config = (intRow?.data?.config ?? {}) as { key_id?: string };
  const isConnected = !!intRow?.data?.active;
  const upiId = (orgData?.data as { upi_id: string | null } | null)?.upi_id ?? "";

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href={`/org/${params.orgSlug}/settings`}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Settings
        </Link>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Payment Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Connect Razorpay for automated payment links, or add your UPI ID as a free fallback.
        </p>
      </div>

      {/* Razorpay */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Razorpay (recommended)</h2>
        <RazorpaySettingsForm
          orgId={org.id}
          orgSlug={params.orgSlug}
          initialKeyId={config.key_id ?? ""}
          isConnected={isConnected}
        />
      </div>

      {/* UPI fallback */}
      <div className="space-y-3 border-t border-[var(--border)] pt-6">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">UPI fallback</h2>
          <p className="text-xs text-[var(--text-3)] mt-0.5">
            For coaches without Razorpay. Generates a <code className="text-[var(--brand)]">upi://</code> deep link — customers tap it to pay instantly on any UPI app.
          </p>
        </div>
        <UpiIdForm orgId={org.id} initialUpiId={upiId} />
      </div>
    </div>
  );
}
