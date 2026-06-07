"use client";

import * as React from "react";
import {
  CheckCircle2, XCircle, Copy, Check, Instagram,
  Phone, Zap, ArrowRight, BookOpen, Activity,
  ClipboardList, LayoutDashboard, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/* ── Types ────────────────────────────────────────────────────────────────── */

interface IntegrationStatus {
  connected: boolean;
  label:     string;
  detail?:   string;
  updatedAt?: string;
}

interface HealthEntry {
  name:         string;
  connected:    boolean;
  lastIncoming?: string | null;
  lastOutgoing?: string | null;
  webhookNote?:  string;
}

interface AutomationIntake {
  what_you_sell?:         string | null;
  ideal_customer?:        string | null;
  avg_price?:             string | null;
  qualifies_lead?:        string | null;
  disqualifies_lead?:     string | null;
  booking_reminder_tone?: string | null;
  preferred_tone?:        string | null;
  payment_reminder_tone?: string | null;
  payment_reminder_freq?: string | null;
  common_questions?:      string | null;
  common_objections?:     string | null;
  escalation_rules?:      string | null;
  additional_notes?:      string | null;
}

export interface ManychatsClientProps {
  orgSlug:     string;
  orgId:       string;
  funnelUrl:   string;
  calUrl:      string;
  handoffUrl:  string;
  webhookToken: string;

  instagram:  IntegrationStatus;
  whatsapp:   IntegrationStatus;
  manychat:   IntegrationStatus;

  health: HealthEntry[];

  intake: AutomationIntake | null;
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
type Tab = "overview" | "setup" | "health" | "intake";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview",          icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { id: "setup",    label: "Setup Guide",       icon: <BookOpen        className="h-3.5 w-3.5" /> },
  { id: "health",   label: "Health",            icon: <Activity        className="h-3.5 w-3.5" /> },
  { id: "intake",   label: "Automation Intake", icon: <ClipboardList   className="h-3.5 w-3.5" /> },
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(value).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded p-1 text-[var(--text-3)] hover:text-[var(--brand)] hover:bg-[var(--brand)]/10 transition-colors"
      aria-label="Copy"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-[var(--brand)]" />
        : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function UrlChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-[var(--text-2)]">{label}</p>
      <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2">
        <span className="flex-1 min-w-0 truncate text-xs font-mono text-[var(--text)]">{value}</span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function StatusChip({ connected, override }: { connected: boolean; override?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
      connected
        ? "border-[var(--brand)]/30 bg-[var(--brand)]/8 text-[var(--brand)]"
        : "border-[var(--border)] bg-[var(--bg-3)] text-[var(--text-3)]",
    )}>
      {connected
        ? <CheckCircle2 className="h-2.5 w-2.5" />
        : <XCircle className="h-2.5 w-2.5" />}
      {override ?? (connected ? "Connected" : "Not connected")}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ── Overview Tab ─────────────────────────────────────────────────────────── */

function OverviewTab({
  orgSlug, instagram, whatsapp, manychat, funnelUrl, calUrl, handoffUrl, webhookToken,
}: Pick<ManychatsClientProps, "orgSlug" | "instagram" | "whatsapp" | "manychat" | "funnelUrl" | "calUrl" | "handoffUrl" | "webhookToken">) {
  const channels = [
    {
      name:  "Instagram DMs",
      icon:  <Instagram className="h-5 w-5" />,
      info:  instagram,
      settingsHref: `/org/${orgSlug}/settings/channel/instagram`,
      connectHref:  `/api/auth/meta/connect?orgSlug=${orgSlug}`,
    },
    {
      name:  "WhatsApp Business",
      icon:  <Phone className="h-5 w-5" />,
      info:  whatsapp,
      settingsHref: `/org/${orgSlug}/settings/whatsapp`,
      connectHref:  `/org/${orgSlug}/settings/whatsapp`,
    },
    {
      name:  "ManyChat Webhook",
      icon:  <Zap className="h-5 w-5" />,
      info:  manychat,
      settingsHref: `/org/${orgSlug}/settings/channel/manychat`,
      connectHref:  `/org/${orgSlug}/settings/channel/manychat`,
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-3)] leading-relaxed">
        All your channel connections at a glance. Use ManyChat to capture leads from stories,
        comments, and keyword DMs — then Effora AI takes over all follow-up automatically.
      </p>

      {/* Channel cards */}
      <div className="space-y-3">
        {channels.map((ch) => (
          <div key={ch.name} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
                  ch.info.connected ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "bg-[var(--bg-3)] text-[var(--text-3)]",
                )}>
                  {ch.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[var(--text)]">{ch.name}</p>
                    <StatusChip connected={ch.info.connected} override={ch.info.label} />
                  </div>
                  {ch.info.detail && (
                    <p className="text-xs text-[var(--text-3)] mt-0.5 truncate">{ch.info.detail}</p>
                  )}
                  {ch.info.updatedAt && (
                    <p className="text-[10px] text-[var(--text-3)]/60 mt-0.5">
                      {ch.info.connected ? "Connected" : "Last updated"} {fmtDate(ch.info.updatedAt)}
                    </p>
                  )}
                </div>
              </div>
              <Link
                href={ch.info.connected ? ch.settingsHref : ch.connectHref}
                className={cn(
                  "shrink-0 flex items-center gap-1 rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  ch.info.connected
                    ? "border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-2)] hover:bg-[var(--bg-3)]"
                    : "bg-[var(--brand)] text-[#0A0A0C] hover:opacity-90",
                )}
              >
                {ch.info.connected ? "Manage" : "Connect"}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Quick URLs */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">Quick URLs</h2>
        <UrlChip label="Your Funnel URL (paste in ManyChat messages)" value={funnelUrl} />
        <UrlChip
          label="Your Cal.com URL"
          value={calUrl || "Connect Cal.com first → Settings › Cal.com"}
        />
        <UrlChip label="ManyChat Handoff URL (POST)" value={handoffUrl} />
        {webhookToken && <UrlChip label="X-Webhook-Token header" value={webhookToken} />}
      </div>
    </div>
  );
}

/* ── Setup Guide Tab ──────────────────────────────────────────────────────── */

const IG_GUIDE = [
  { step: "Convert your Instagram account to a Professional (Business or Creator) account via Instagram Settings." },
  { step: "Connect your Instagram account to a Facebook Page inside Facebook Business Settings." },
  { step: "Inside Effora AI, go to Settings › Channels › Instagram and click Connect Instagram." },
  { step: "Send a test DM to your Instagram account from another account." },
  { step: "Open the Inbox in Effora AI and confirm the message appears." },
];

const WA_GUIDE = [
  { step: "Go to developers.facebook.com and create a new Meta App (type: Business)." },
  { step: "Add the WhatsApp product to your app and complete the business verification." },
  { step: "In the WhatsApp Cloud API dashboard, generate a permanent token via System Users in Meta Business Suite." },
  { step: "Copy your WABA ID (WhatsApp Business Account ID) from the WhatsApp dashboard." },
  { step: "Copy your Phone Number ID from the WhatsApp Cloud API phone numbers panel." },
  { step: "Inside Effora AI, go to Settings › WhatsApp and paste your credentials to connect." },
  { step: "Send a test WhatsApp message to your connected number." },
  { step: "Open the Inbox in Effora AI and confirm the message appears." },
];

const MC_GUIDES = [
  {
    title:  "Guide A — Story Reply Trigger (free)",
    icon:   "📸",
    steps: [
      "In ManyChat, go to Automation › New Flow.",
      "Set Trigger: Story Reply (Any).",
      "Add Action: Send Message → paste your Funnel URL.",
      "Publish the flow.",
    ],
  },
  {
    title:  "Guide B — Comment Trigger (free)",
    icon:   "💬",
    steps: [
      "New Flow › Trigger: Comment on Post.",
      "Set keywords: INFO, PRICE, BOOK.",
      "Add Action: Send Message → paste your Funnel URL or Cal.com URL.",
      "Publish the flow.",
    ],
  },
  {
    title:  "Guide C — DM Keyword Trigger (free)",
    icon:   "✉️",
    steps: [
      "New Flow › Trigger: DM Keyword.",
      "Set keywords: PRICE, INFO, BOOK, COACH.",
      "Add Action: Send Message → paste your Cal.com URL.",
      "Publish the flow.",
    ],
  },
  {
    title:  "Guide D — Hand off to Effora AI (any plan)",
    icon:   "🤖",
    steps: [
      "After your trigger fires and sends the initial resource…",
      "Add Action: HTTP Request › Method: POST.",
      "URL: paste your Handoff URL (from the Overview tab).",
      "Header: X-Webhook-Token → paste your webhook token.",
      "Body: include ig_user_id, ig_username, name, trigger_keyword, initial_message.",
      "Effora AI receives the lead and handles all follow-up automatically.",
    ],
  },
];

function GuideSection({ title, steps }: { title: string; steps: { step: string }[] }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-3">
      <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">{title}</p>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-xs text-[var(--text-3)] leading-relaxed">
            <span className="shrink-0 font-mono text-[var(--brand)] font-semibold w-4">{i + 1}.</span>
            <span>{s.step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SetupGuideTab() {
  return (
    <div className="space-y-8">
      {/* Instagram */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Instagram className="h-4 w-4 text-[var(--brand)]" />
          <h2 className="font-display text-base font-semibold text-[var(--text)]">Instagram Setup</h2>
        </div>
        <GuideSection
          title="Connect Instagram DMs to Effora AI"
          steps={IG_GUIDE}
        />
      </div>

      {/* WhatsApp */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-[var(--brand)]" />
          <h2 className="font-display text-base font-semibold text-[var(--text)]">WhatsApp Setup</h2>
        </div>
        <GuideSection
          title="Connect WhatsApp Business Cloud API to Effora AI"
          steps={WA_GUIDE}
        />
      </div>

      {/* ManyChat */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[var(--brand)]" />
          <h2 className="font-display text-base font-semibold text-[var(--text)]">ManyChat Automation Guides</h2>
        </div>
        <p className="text-xs text-[var(--text-3)]">
          All guides below use ManyChat free features — no paid plan required for Guides A, B, and C.
        </p>
        <div className="space-y-3">
          {MC_GUIDES.map((g) => (
            <div key={g.title} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-3">
              <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
                {g.icon} {g.title}
              </p>
              <ol className="space-y-2">
                {g.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-[var(--text-3)] leading-relaxed">
                    <span className="shrink-0 font-mono text-[var(--brand)] font-semibold w-4">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Health Tab ───────────────────────────────────────────────────────────── */

function HealthTab({ health }: { health: HealthEntry[] }) {
  const allConnected = health.every((h) => h.connected);

  return (
    <div className="space-y-6">
      {/* Summary badge */}
      <div className={cn(
        "flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-3",
        allConnected
          ? "border-[var(--brand)]/30 bg-[var(--brand)]/5"
          : "border-amber-500/30 bg-amber-500/5",
      )}>
        {allConnected
          ? <CheckCircle2 className="h-4 w-4 text-[var(--brand)] shrink-0" />
          : <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />}
        <p className={cn("text-sm font-medium", allConnected ? "text-[var(--brand)]" : "text-amber-400")}>
          {allConnected ? "All channels connected" : "One or more channels not connected"}
        </p>
      </div>

      {/* Per-channel diagnostics */}
      <div className="space-y-3">
        {health.map((entry) => (
          <div key={entry.name} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-[var(--text)]">{entry.name}</p>
              <StatusChip connected={entry.connected} />
            </div>

            {/* Diagnostics grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
              <DiagRow
                label="Connection Status"
                value={entry.connected ? "✅ Connected" : "❌ Not connected"}
                ok={entry.connected}
              />
              <DiagRow
                label="Webhook Status"
                value={entry.connected ? "Healthy" : "No connection"}
                ok={entry.connected}
              />
              <DiagRow
                label="Last Incoming Message"
                value={fmtTime(entry.lastIncoming)}
                ok={!!entry.lastIncoming}
              />
              <DiagRow
                label="Last Outgoing Message"
                value={fmtTime(entry.lastOutgoing)}
                ok={!!entry.lastOutgoing}
              />
            </div>

            {entry.webhookNote && (
              <p className="text-[10px] text-[var(--text-3)]/70 leading-relaxed">{entry.webhookNote}</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--text-3)]">
        Read-only diagnostics — displaying existing data only.
        To change credentials or reconnect, visit Settings › Channels.
      </p>
    </div>
  );
}

function DiagRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium text-[var(--text-3)] uppercase tracking-wider">{label}</p>
      <p className={cn("text-xs font-medium", ok ? "text-[var(--text)]" : "text-[var(--text-3)]")}>{value}</p>
    </div>
  );
}

/* ── Automation Intake Tab ────────────────────────────────────────────────── */

const INTAKE_FIELDS: {
  section: string;
  fields: { key: keyof AutomationIntake; label: string; placeholder: string; rows?: number }[];
}[] = [
  {
    section: "Business / Offer",
    fields: [
      { key: "what_you_sell",  label: "What do you sell?",         placeholder: "e.g. 1-on-1 fitness coaching, 12-week transformation programme…",   rows: 2 },
      { key: "ideal_customer", label: "Who is your ideal customer?", placeholder: "e.g. busy professionals aged 25–40 who want to lose weight…",        rows: 2 },
      { key: "avg_price",      label: "Average price?",            placeholder: "e.g. ₹25,000 for 3 months",                                           rows: 1 },
    ],
  },
  {
    section: "Lead Qualification",
    fields: [
      { key: "qualifies_lead",    label: "What qualifies a lead?",    placeholder: "e.g. has a budget, is ready to start within 30 days…",  rows: 2 },
      { key: "disqualifies_lead", label: "What disqualifies a lead?", placeholder: "e.g. not serious, no budget, just browsing…",           rows: 2 },
    ],
  },
  {
    section: "Booking Flow",
    fields: [
      { key: "booking_reminder_tone", label: "How should booking reminders sound?", placeholder: "e.g. warm and encouraging, short and direct…", rows: 2 },
      { key: "preferred_tone",        label: "Preferred overall tone?",             placeholder: "e.g. professional but friendly, casual, high-energy…", rows: 1 },
    ],
  },
  {
    section: "Payment Flow",
    fields: [
      { key: "payment_reminder_tone", label: "How should payment reminders sound?", placeholder: "e.g. friendly but firm, urgent…",        rows: 2 },
      { key: "payment_reminder_freq", label: "How often should reminders be sent?", placeholder: "e.g. day 1, day 3, day 7 after sending…", rows: 1 },
    ],
  },
  {
    section: "FAQ",
    fields: [
      { key: "common_questions",  label: "Common questions your leads ask?",   placeholder: "e.g. What's included? Do you offer EMI?…",  rows: 3 },
      { key: "common_objections", label: "Common objections you hear?",        placeholder: "e.g. It's too expensive. I'll think about it…", rows: 3 },
    ],
  },
  {
    section: "Escalation Rules",
    fields: [
      { key: "escalation_rules", label: "When should AI stop and hand over to a human?", placeholder: "e.g. if lead asks for refund, if angry, if complex custom request…", rows: 3 },
    ],
  },
  {
    section: "Additional Notes",
    fields: [
      { key: "additional_notes", label: "Anything else we should know?", placeholder: "Any extra context about your business, clients, or style…", rows: 3 },
    ],
  },
];

function AutomationIntakeTab({ orgId, intake }: { orgId: string; intake: AutomationIntake | null }) {
  const [form, setForm] = React.useState<AutomationIntake>(intake ?? {});
  const [saving, setSaving]  = React.useState(false);
  const [saved, setSaved]    = React.useState(false);
  const [error, setError]    = React.useState<string | null>(null);

  function set(key: keyof AutomationIntake, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/automation-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? "Failed to save");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      <p className="text-sm text-[var(--text-3)] leading-relaxed">
        Tell us how you want your automations built. Your answers help us configure
        AI follow-up, booking reminders, payment nudges, and escalation logic
        perfectly for your coaching business.
      </p>

      {INTAKE_FIELDS.map(({ section, fields }) => (
        <div key={section} className="space-y-4">
          <h2 className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider border-b border-[var(--border)] pb-2">
            {section}
          </h2>
          {fields.map(({ key, label, placeholder, rows }) => (
            <div key={key} className="space-y-1.5">
              <label htmlFor={key} className="block text-xs font-medium text-[var(--text-2)]">
                {label}
              </label>
              <textarea
                id={key}
                rows={rows ?? 2}
                value={form[key] ?? ""}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--brand)]/50 focus:ring-1 focus:ring-[var(--brand)]/20 resize-none transition-colors"
              />
            </div>
          ))}
        </div>
      ))}

      {/* Save area */}
      <div className="flex items-center gap-3 pt-2 border-t border-[var(--border)]">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? "Saving…" : "Save Preferences"}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--brand)]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {error && (
          <span className="text-xs text-red-400">{error}</span>
        )}
      </div>
    </form>
  );
}

/* ── Root Client Component ────────────────────────────────────────────────── */

export function ManychatsClient(props: ManychatsClientProps) {
  const [tab, setTab] = React.useState<Tab>("overview");

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
              tab === t.id
                ? "bg-[var(--bg-1)] text-[var(--text)] shadow-sm border border-[var(--border)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <OverviewTab
          orgSlug={props.orgSlug}
          instagram={props.instagram}
          whatsapp={props.whatsapp}
          manychat={props.manychat}
          funnelUrl={props.funnelUrl}
          calUrl={props.calUrl}
          handoffUrl={props.handoffUrl}
          webhookToken={props.webhookToken}
        />
      )}
      {tab === "setup"  && <SetupGuideTab />}
      {tab === "health" && <HealthTab health={props.health} />}
      {tab === "intake" && <AutomationIntakeTab orgId={props.orgId} intake={props.intake} />}
    </div>
  );
}
