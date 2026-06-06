export const dynamic = "force-dynamic";

/**
 * /org/[slug]/settings — Settings index
 * 2-column grid of setting category cards with status pills.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Instagram, CalendarDays, CreditCard, Mic, Receipt, Users,
  Shield, UserX, ChevronRight, CheckCircle2, Circle, Lock, Phone,
} from "lucide-react";

interface Props { params: { orgSlug: string } }

export const metadata = { title: "Settings — Effora AI" };

export default async function SettingsIndexPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgRow } = await supabase
    .from("orgs")
    .select("id, name, plan")
    .eq("slug", params.orgSlug)
    .single();

  if (!orgRow) notFound();
  const org = orgRow as { id: string; name: string; plan: string };

  const svc = createServiceClient();

  // Load status data in parallel
  const [integrationsRes, voiceRes] = await Promise.all([
    svc.from("integrations")
      .select("provider, active")
      .eq("org_id", org.id),
    svc.from("voice_profiles")
      .select("id, tone")
      .eq("org_id", org.id)
      .maybeSingle(),
  ]);

  const integrations = (integrationsRes.data ?? []) as { provider: string; active: boolean }[];
  const voice = voiceRes.data as { id: string; tone: string } | null;

  // Derive per-section status
  const hasInstagram = integrations.some((i) => (i.provider === "instagram" || i.provider === "meta_instagram") && i.active);
  const hasManyChat  = integrations.some((i) => i.provider === "manychat"       && i.active);
  const hasCalcom    = integrations.some((i) => i.provider === "calcom"         && i.active);
  const hasRazorpay  = integrations.some((i) => i.provider === "razorpay"       && i.active);
  const hasWhatsApp  = integrations.some((i) => i.provider === "whatsapp_cloud" && i.active);
  const hasVoice     = !!voice;

  type StatusVariant = "connected" | "configured" | "not_connected" | "coming_soon";

  interface Section {
    key: string;
    href: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    status: StatusVariant;
    statusLabel: string;
    disabled?: boolean;
  }

  const sections: Section[] = [
    {
      key: "channel",
      href: `settings/channel`,
      icon: <Instagram className="h-5 w-5" />,
      title: "Instagram",
      description: "Connect Instagram DMs or ManyChat to receive leads automatically.",
      status:      (hasInstagram || hasManyChat) ? "connected" : "not_connected",
      statusLabel: (hasInstagram || hasManyChat) ? "Connected" : "Not connected",
    },
    {
      key: "whatsapp",
      href: `settings/whatsapp`,
      icon: <Phone className="h-5 w-5" />,
      title: "WhatsApp",
      description: "Connect WhatsApp Business to receive and reply to DMs in real time.",
      status:      hasWhatsApp ? "connected" : "not_connected",
      statusLabel: hasWhatsApp ? "Connected" : "Not connected",
    },
    {
      key: "cal",
      href: `settings/cal`,
      icon: <CalendarDays className="h-5 w-5" />,
      title: "Booking (Cal.com)",
      description: "Share a smart booking link so hot leads book calls straight from a DM.",
      status:      hasCalcom ? "connected" : "not_connected",
      statusLabel: hasCalcom ? "Connected" : "Not connected",
    },
    {
      key: "payments",
      href: `settings/payments`,
      icon: <Receipt className="h-5 w-5" />,
      title: "Payments (Razorpay)",
      description: "Collect coaching fees, track dunning, and reconcile every rupee.",
      status:      hasRazorpay ? "connected" : "not_connected",
      statusLabel: hasRazorpay ? "Connected" : "Not connected",
    },
    {
      key: "voice",
      href: `settings/voice`,
      icon: <Mic className="h-5 w-5" />,
      title: "Voice profile",
      description: "Define your tone, offer, and price range so the AI replies exactly like you.",
      status:      hasVoice ? "configured" : "not_connected",
      statusLabel: hasVoice ? `Configured · ${voice?.tone ?? ""}` : "Not configured",
    },
    {
      key: "billing",
      href: `settings/billing`,
      icon: <CreditCard className="h-5 w-5" />,
      title: "Billing & plan",
      description: "Manage your Effora AI subscription, view AI usage, and upgrade anytime.",
      status:      (org.plan !== "trial" && org.plan !== "cancelled") ? "connected" : "not_connected",
      statusLabel: org.plan === "trial"     ? "Free trial"
                 : org.plan === "cancelled" ? "Cancelled"
                 : org.plan.charAt(0).toUpperCase() + org.plan.slice(1),
    },
    {
      key: "security",
      href: `settings/security`,
      icon: <Shield className="h-5 w-5" />,
      title: "Security",
      description: "Enable two-factor authentication for an extra layer of account protection.",
      status:      "not_connected",
      statusLabel: "Configure",
    },
    {
      key: "account",
      href: `settings/account`,
      icon: <UserX className="h-5 w-5" />,
      title: "Account",
      description: "Export your data or permanently delete this workspace.",
      status:      "not_connected",
      statusLabel: "Manage",
    },
    {
      key: "team",
      href: `#`,
      icon: <Users className="h-5 w-5" />,
      title: "Team",
      description: "Invite teammates, assign roles, and collaborate on your pipeline.",
      status:      "coming_soon",
      statusLabel: "Coming soon",
      disabled:    true,
    },
  ];

  const statusStyles: Record<StatusVariant, string> = {
    connected:     "bg-[var(--brand)]/10 text-[var(--brand)]",
    configured:    "bg-[var(--brand)]/10 text-[var(--brand)]",
    not_connected: "bg-[var(--bg-3)] text-[var(--text-3)]",
    coming_soon:   "bg-[var(--bg-3)] text-[var(--text-3)]",
  };

  const statusIcons: Record<StatusVariant, React.ReactNode> = {
    connected:     <CheckCircle2 className="h-3 w-3" />,
    configured:    <CheckCircle2 className="h-3 w-3" />,
    not_connected: <Circle className="h-3 w-3 opacity-40" />,
    coming_soon:   <Lock className="h-3 w-3 opacity-40" />,
  };

  return (
    <div className="space-y-7">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Configure channels, integrations, and preferences for {org.name}.
        </p>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((s, i) => {
          const Inner = (
            <div
              className={[
                "group relative flex h-full flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5 transition-all duration-200",
                s.disabled
                  ? "cursor-default opacity-60"
                  : "hover:border-[var(--brand)]/40 hover:bg-[var(--bg-2)] hover:-translate-y-0.5",
              ].join(" ")}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-3)] text-[var(--brand)] transition-colors group-hover:bg-[var(--brand)]/10">
                  {s.icon}
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusStyles[s.status]}`}>
                  {statusIcons[s.status]}
                  {statusLabel(s.statusLabel)}
                </span>
              </div>

              {/* Text */}
              <div className="flex-1">
                <p className="font-semibold text-[var(--text)]">{s.title}</p>
                <p className="mt-1 text-xs text-[var(--text-3)] leading-relaxed">{s.description}</p>
              </div>

              {/* Arrow */}
              {!s.disabled && (
                <div className="flex items-center justify-end">
                  <span className="flex items-center gap-1 text-[11px] text-[var(--text-3)] opacity-0 transition-opacity group-hover:opacity-100">
                    Open <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              )}
            </div>
          );

          return s.disabled ? (
            <div key={s.key}>{Inner}</div>
          ) : (
            <Link key={s.key} href={s.href}>
              {Inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Trim voice tone label if too long
function statusLabel(label: string): string {
  return label.length > 28 ? label.slice(0, 26) + "…" : label;
}
