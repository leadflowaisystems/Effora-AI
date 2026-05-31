import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import {
  Calendar, CreditCard, Mic, ArrowRight,
  CheckCircle2, Activity, Instagram, Zap, Phone,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as React from "react";

export async function generateMetadata({ params }: { params: { orgSlug: string } }) {
  return { title: `Integration health — Effora AI` };
}

export default async function HealthPage({ params }: { params: { orgSlug: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgData } = await supabase
    .from("orgs")
    .select("id, name, active_channel, onboarding_completed_at")
    .eq("slug", params.orgSlug)
    .single();

  const org = orgData as {
    id: string; name: string; active_channel: string;
    onboarding_completed_at: string | null;
  } | null;
  if (!org) notFound();

  const service = createServiceClient();
  const { data: intRows } = await service
    .from("integrations")
    .select("provider, active, config, updated_at")
    .eq("org_id", org.id);

  const intMap = Object.fromEntries(
    (intRows ?? []).map((r) => [r.provider, r])
  ) as Record<string, { provider: string; active: boolean; config: Record<string, string>; updated_at: string } | undefined>;

  const { data: voiceData } = await service
    .from("voice_profiles")
    .select("tone, offer, updated_at")
    .eq("org_id", org.id)
    .single();
  const voice = voiceData as { tone: string; offer: string; updated_at: string } | null;

  // Instagram
  const igRow    = intMap["meta_instagram"];
  const igActive = !!(igRow?.active);
  const igUser   = (igRow?.config as Record<string, string> | undefined)?.ig_username ?? "";
  const igExpiry = (igRow?.config as Record<string, string> | undefined)?.token_expires_at;
  const igDaysLeft = igExpiry
    ? Math.max(0, Math.floor((new Date(igExpiry).getTime() - Date.now()) / 86400000))
    : null;
  const metaAppMode = process.env.META_APP_MODE ?? "dev";

  // Quota
  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [brevoTodayRes, aiMsgRes] = await Promise.all([
    (service as any).from("brevo_send_log").select("id", { count: "exact", head: true })
      .eq("org_id", org.id).gte("sent_at", today),
    service.from("orgs").select("monthly_ai_msg_count").eq("id", org.id).single(),
  ]);
  const brevoToday = brevoTodayRes.count ?? 0;
  const aiMsgCount = (aiMsgRes.data as { monthly_ai_msg_count: number } | null)?.monthly_ai_msg_count ?? 0;
  const brevoLimit = 300;
  const aiLimit    = 2000;

  function quotaColor(pct: number) {
    if (pct >= 90) return "text-red-400";
    if (pct >= 70) return "text-amber-400";
    return "text-[var(--brand)]";
  }

  const allHealthy = voice &&
    (org.active_channel === "manual" || intMap[org.active_channel]?.active);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Integration health</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">{org.name} — all connected services at a glance.</p>
        </div>
        {allHealthy && (
          <div className="flex items-center gap-1.5 shrink-0 mt-1">
            <CheckCircle2 className="h-4 w-4 text-[var(--brand)]" />
            <span className="text-sm text-[var(--brand)] font-medium">All systems go</span>
          </div>
        )}
      </div>

      {/* ── Cards ── */}
      <div className="space-y-3">

        {/* Instagram — full OAuth card */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-3">
          {metaAppMode !== "live" && (
            <div className="flex items-start gap-2 rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400/90 leading-relaxed">
                Real-time Instagram sync is awaiting Meta App approval (typical wait: 1–3 weeks).
                Connect button works only for test accounts until then.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
                igActive ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "bg-[var(--bg-3)] text-[var(--text-3)]",
              )}>
                <Instagram className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-[var(--text)]">Instagram DMs</p>
                  <span className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                    igActive
                      ? "border-[var(--brand)]/30 bg-[var(--brand)]/8 text-[var(--brand)]"
                      : "border-[var(--border)] bg-[var(--bg-3)] text-[var(--text-3)]",
                  )}>
                    {igActive ? "Connected" : "Not connected"}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-3)] mt-0.5 truncate">
                  {igActive
                    ? `@${igUser}${igDaysLeft !== null ? ` · token expires in ${igDaysLeft}d` : ""}`
                    : "Connect your Instagram Business account via Effora AI OAuth"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {igActive && (
                <Link
                  href={`/org/${params.orgSlug}/settings/channel/instagram`}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors"
                >
                  Manage
                </Link>
              )}
              <Link
                href={`/api/auth/meta/connect?orgSlug=${params.orgSlug}`}
                className={cn(
                  "rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium transition-colors",
                  igActive
                    ? "border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--bg-3)]"
                    : "bg-[var(--brand)] text-[#0A0A0C] hover:opacity-90",
                )}
              >
                {igActive ? "Reconnect" : "Connect Instagram"}
              </Link>
            </div>
          </div>
        </div>

        {/* Voice Profile */}
        <SimpleCard
          icon={<Mic className="h-5 w-5" />}
          name="Voice Profile"
          connected={!!voice}
          description={
            voice
              ? `Tone: ${voice.tone}${voice.offer ? ` · ${voice.offer.slice(0, 60)}…` : ""}`
              : "Set up your voice so AI communicates in your style."
          }
          meta={voice ? `Updated ${fmtDate(voice.updated_at)}` : undefined}
          actionLabel={voice ? "Edit voice →" : "Set up voice →"}
          actionHref={`/org/${params.orgSlug}/settings/voice`}
        />

        {/* Cal.com */}
        <SimpleCard
          icon={<Calendar className="h-5 w-5" />}
          name="Cal.com"
          connected={!!intMap["calcom"]?.active}
          description={
            intMap["calcom"]?.active
              ? "Booking links will be auto-created when a lead qualifies."
              : "Connect Cal.com to auto-schedule discovery calls."
          }
          meta={intMap["calcom"] ? `Connected ${fmtDate(intMap["calcom"].updated_at)}` : undefined}
          actionLabel={intMap["calcom"]?.active ? "Manage →" : "Connect →"}
          actionHref={`/org/${params.orgSlug}/settings/cal`}
        />

        {/* Razorpay */}
        <SimpleCard
          icon={<CreditCard className="h-5 w-5" />}
          name="Razorpay"
          connected={!!intMap["razorpay"]?.active}
          description={
            intMap["razorpay"]?.active
              ? "Payment links will be sent automatically when a booking is confirmed."
              : "Connect Razorpay to collect payments from your leads."
          }
          meta={intMap["razorpay"] ? `Connected ${fmtDate(intMap["razorpay"].updated_at)}` : undefined}
          actionLabel={intMap["razorpay"]?.active ? "Manage →" : "Connect →"}
          actionHref={`/org/${params.orgSlug}/settings/payments`}
        />

        {/* ManyChat */}
        <SimpleCard
          icon={<Zap className="h-5 w-5" />}
          name="ManyChat"
          connected={!!intMap["manychat"]?.active}
          statusOverride={!intMap["manychat"]?.active ? "Free tier always available" : undefined}
          description={
            intMap["manychat"]?.active
              ? "ManyChat webhook active — forwarding leads to Effora AI."
              : "Story replies, comment triggers, keyword DMs — all free."
          }
          meta={intMap["manychat"] ? `Configured ${fmtDate(intMap["manychat"].updated_at)}` : undefined}
          actionLabel="Setup guides →"
          actionHref={`/org/${params.orgSlug}/settings/channel/manychat`}
        />

        {/* WhatsApp */}
        <SimpleCard
          icon={<Phone className="h-5 w-5" />}
          name="WhatsApp Business"
          connected={!!intMap["whatsapp"]?.active}
          description={
            intMap["whatsapp"]?.active
              ? "WhatsApp messages are syncing automatically."
              : "Configure your WhatsApp Business number for automated follow-ups."
          }
          meta={intMap["whatsapp"] ? `Configured ${fmtDate(intMap["whatsapp"].updated_at)}` : undefined}
          actionLabel={intMap["whatsapp"]?.active ? "Manage →" : "Set up →"}
          actionHref={`/org/${params.orgSlug}/settings/whatsapp`}
        />
      </div>

      {/* Quota */}
      <div>
        <h2 className="font-display text-base font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--brand)]" /> Quota usage
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Brevo emails today",       value: brevoToday, limit: brevoLimit },
            { label: "AI messages this month",   value: aiMsgCount, limit: aiLimit },
          ].map(({ label, value, limit }) => {
            const pct = Math.round(value / limit * 100);
            return (
              <div key={label} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-2">
                <p className="text-xs text-[var(--text-3)]">{label}</p>
                <p className={cn("font-mono text-2xl font-bold", quotaColor(pct))}>
                  {value}<span className="text-sm font-normal text-[var(--text-3)]">/{limit}</span>
                </p>
                <div className="h-1.5 rounded-full bg-[var(--bg-3)]">
                  <div className={cn("h-1.5 rounded-full transition-all",
                    pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-[var(--brand)]"
                  )} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">Ready to start closing?</p>
          <p className="text-xs text-[var(--text-3)] mt-0.5">Your workspace is set up. Head to the dashboard to manage leads.</p>
        </div>
        <Button variant="primary" size="sm" asChild>
          <Link href={`/org/${params.orgSlug}`}>
            Open dashboard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ── Small card component ─────────────────────────────────────────────────────
function SimpleCard({ icon, name, connected, statusOverride, description, meta, actionLabel, actionHref }: {
  icon:           React.ReactNode;
  name:           string;
  connected:      boolean;
  statusOverride?: string;
  description:    string;
  meta?:          string;
  actionLabel:    string;
  actionHref:     string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
          connected ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "bg-[var(--bg-3)] text-[var(--text-3)]",
        )}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-[var(--text)]">{name}</p>
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
              connected
                ? "border-[var(--brand)]/30 bg-[var(--brand)]/8 text-[var(--brand)]"
                : "border-[var(--border)] bg-[var(--bg-3)] text-[var(--text-3)]",
            )}>
              {statusOverride ?? (connected ? "Connected" : "Not connected")}
            </span>
          </div>
          <p className="text-xs text-[var(--text-3)] mt-0.5 leading-relaxed truncate">{description}</p>
          {meta && <p className="text-[10px] text-[var(--text-3)]/60 mt-0.5">{meta}</p>}
        </div>
      </div>
      <Link
        href={actionHref}
        className="shrink-0 flex items-center gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:border-[var(--brand)]/40 transition-colors whitespace-nowrap"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
