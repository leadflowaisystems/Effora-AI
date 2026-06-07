"use client";

/**
 * LeadDetail — comprehensive lead profile page component.
 *
 * Sections:
 *   1. Header   — identity, stage, score, contact, LTV, quick actions
 *   2. Activity timeline — messages + bookings + payments merged chronologically
 *   3. Bookings — all bookings with status
 *   4. Payments — all payments with totals
 *   5. Notes    — inline notes editing
 *   6. Conversations — chat thread links
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Download, Instagram, Phone, Mail, Globe,
  Calendar, CreditCard, MessageSquare, StickyNote,
  CheckCircle2, Clock, AlertTriangle, XCircle,
  ChevronDown, ChevronRight, ExternalLink, Edit2, Save, X,
  UserCircle,
} from "lucide-react";
import { LeadSearchSelector } from "./lead-search-selector";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/range";
import { toast } from "@/components/ui/use-toast";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface Lead {
  id: string; name: string | null; external_id: string; channel: string;
  score: number; stage: string; tags?: string[] | null; notes?: string | null;
  ltv_inr?: number | null; last_seen_at?: string | null; created_at: string;
  source?: string | null; avatar_url?: string | null;
  metadata?: Record<string, unknown> | null;
}
interface Conversation { id: string; channel_provider: string; last_message_at: string | null; last_message_preview: string | null; created_at: string }
interface Booking { id: string; status: string; starts_at: string | null; ends_at: string | null; meeting_url: string | null; attendee_name: string | null; attendee_email: string | null; recovery_attempt: number; created_at: string; deleted_at?: string | null }
interface Payment { id: string; amount_inr: number; status: string; payment_link_url: string | null; notes: string | null; created_at: string; updated_at: string; deleted_at?: string | null }
interface LeadEvent { id: string; event_type: string; entity_type: string; entity_id: string | null; title: string; metadata: Record<string, unknown>; created_at: string }

interface Props {
  lead:          Lead;
  conversations: Conversation[];
  bookings:      Booking[];
  payments:      Payment[];
  leadEvents:    LeadEvent[];
  orgId:         string;
  orgSlug:       string;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function formatInr(n: number | null | undefined): string {
  if (!n) return "₹0";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d < 1)  return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso);
}
function initials(name: string | null, fallback: string): string {
  const s = name ?? fallback;
  return s.split(/[\s_@]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

const STAGE_BADGE: Record<string, string> = {
  cold:         "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]",
  warm:         "bg-amber-500/15 text-amber-400 border-amber-500/25",
  hot:          "bg-red-500/15 text-red-400 border-red-500/25",
  booking_sent: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  booked:       "bg-[var(--brand)]/15 text-[var(--brand)] border-[var(--brand)]/25",
  won:          "bg-[var(--brand)]/20 text-[var(--brand)] border-[var(--brand)]/30",
  paid:         "bg-[var(--brand)]/25 text-[var(--brand)] border-[var(--brand)]/35",
  lost:         "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]",
};

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
      STAGE_BADGE[stage] ?? STAGE_BADGE.cold
    )}>
      {stage.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left select-none hover:bg-[var(--bg-3)] transition-colors"
      >
        <Icon className="h-4 w-4 text-[var(--brand)] shrink-0" />
        <span className="font-display text-sm font-semibold text-[var(--text)]">{title}</span>
        <span className="ml-auto text-[var(--text-3)]">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && <div className="px-5 pb-5 border-t border-[var(--border)]">{children}</div>}
    </div>
  );
}

/* ── Activity timeline helpers ───────────────────────────────────── */

type TimelineItem =
  | { kind: "event";        data: LeadEvent;      ts: string }
  | { kind: "conversation"; data: Conversation;   ts: string };

function buildTimeline(events: LeadEvent[], convs: Conversation[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...events.map((e) => ({ kind: "event"        as const, data: e, ts: e.created_at })),
    ...convs.map((c)  => ({ kind: "conversation" as const, data: c, ts: c.last_message_at ?? c.created_at })),
  ];
  return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

function eventIcon(eventType: string): { Icon: React.ElementType; color: string } {
  switch (eventType) {
    case "booking_created":   return { Icon: Calendar,      color: "text-emerald-400" };
    case "booking_completed": return { Icon: CheckCircle2,  color: "text-[var(--brand)]" };
    case "booking_no_show":   return { Icon: AlertTriangle, color: "text-red-400" };
    case "booking_archived":  return { Icon: XCircle,       color: "text-[var(--text-3)]" };
    case "booking_deleted":   return { Icon: XCircle,       color: "text-red-400" };
    case "payment_created":   return { Icon: CreditCard,    color: "text-amber-400" };
    case "payment_paid":      return { Icon: CreditCard,    color: "text-[var(--brand)]" };
    case "payment_archived":  return { Icon: CreditCard,    color: "text-[var(--text-3)]" };
    case "payment_deleted":   return { Icon: CreditCard,    color: "text-red-400" };
    default:                  return { Icon: Clock,         color: "text-[var(--text-3)]" };
  }
}

function TimelineRow({ item, orgSlug }: { item: TimelineItem; orgSlug: string }) {
  if (item.kind === "event") {
    const e = item.data;
    const { Icon, color } = eventIcon(e.event_type);
    const isArchived = e.event_type.endsWith("_archived");
    const isDeleted  = e.event_type.endsWith("_deleted");
    return (
      <div className="flex gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
        <div className={cn("mt-0.5 shrink-0", color)}><Icon className="h-4 w-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text)]">
            {e.title}
            {isArchived && <span className="ml-1.5 text-[11px] text-[var(--text-3)] italic">(archived)</span>}
            {isDeleted  && <span className="ml-1.5 text-[11px] text-red-400 italic">(deleted)</span>}
          </p>
          <p className="text-xs text-[var(--text-3)]">{relTime(e.created_at)}</p>
        </div>
      </div>
    );
  }
  // conversation
  const c = item.data;
  return (
    <div className="flex gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
      <div className="mt-0.5 shrink-0 text-[var(--text-3)]"><MessageSquare className="h-4 w-4" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text)]">Conversation · {c.channel_provider.replace("_", " ")}</p>
        {c.last_message_preview && <p className="text-xs text-[var(--text-3)] truncate">{c.last_message_preview}</p>}
        <p className="text-xs text-[var(--text-3)]">{relTime(c.last_message_at)}</p>
      </div>
      <Link href={`/org/${orgSlug}/inbox/${c.id}`} className="shrink-0 text-[var(--brand)] hover:underline text-xs flex items-center gap-1">
        <ExternalLink className="h-3 w-3" /> Open
      </Link>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

export function LeadDetail({ lead, conversations, bookings, payments, leadEvents, orgId, orgSlug }: Props) {
  const router = useRouter();
  const [notes, setNotes]       = React.useState(lead.notes ?? "");
  const [editNotes, setEditNotes] = React.useState(false);
  const [savingNotes, setSavingNotes] = React.useState(false);

  const phone     = (lead.metadata?.phone as string | null) ?? null;
  const igHandle  = (lead.metadata?.instagram_handle as string | null) ??
    (lead.channel === "instagram" ? lead.external_id.replace(/^ig_/, "") : null);
  const email     = (lead.metadata?.email as string | null) ?? null;

  const totalLtv  = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount_inr, 0);
  const timeline  = buildTimeline(leadEvents, conversations);

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      toast({ title: "Notes saved", variant: "success" });
      setEditNotes(false);
    } catch {
      toast({ title: "Error saving notes", variant: "destructive" });
    } finally {
      setSavingNotes(false);
    }
  }

  function handleExport() {
    window.open(`/api/orgs/${orgId}/leads/${lead.id}/export?format=csv`, "_blank");
  }

  return (
    <div className="space-y-6 max-w-3xl pb-16">
      {/* ── Persistent lead selector — switch leads without going back ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-[var(--brand)] shrink-0" />
          <span className="text-xs font-semibold text-[var(--text-2)]">Lead Profile</span>
          <span className="text-xs text-[var(--text-3)]">— switch lead below</span>
        </div>
        <LeadSearchSelector
          orgId={orgId}
          orgSlug={orgSlug}
          selectedId={lead.id}
          placeholder="Switch to a different lead…"
        />
      </div>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6 space-y-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold",
            lead.score >= 75 ? "bg-red-500/20 text-red-400" :
            lead.score >= 50 ? "bg-amber-500/20 text-amber-400" :
            "bg-[var(--bg-3)] text-[var(--text-2)]"
          )}>
            {lead.avatar_url
              ? <img src={lead.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
              : initials(lead.name, lead.external_id)}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-bold text-[var(--text)] truncate">
                {lead.name ?? lead.external_id}
              </h1>
              <StageBadge stage={lead.stage} />
              {lead.score > 0 && (
                <span className={cn(
                  "text-xs font-mono font-semibold",
                  lead.score >= 75 ? "text-red-400" : lead.score >= 50 ? "text-amber-400" : "text-[var(--text-3)]"
                )}>
                  Score: {lead.score}
                </span>
              )}
            </div>

            {/* Contact links */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-3)]">
              {igHandle && (
                <a href={`https://instagram.com/${igHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-pink-400 transition-colors">
                  <Instagram className="h-3.5 w-3.5" /> @{igHandle.replace("@", "")}
                </a>
              )}
              {phone && (
                <a href={`tel:${phone}`} className="flex items-center gap-1 hover:text-[var(--brand)] transition-colors">
                  <Phone className="h-3.5 w-3.5" /> {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="flex items-center gap-1 hover:text-[var(--brand)] transition-colors">
                  <Mail className="h-3.5 w-3.5" /> {email}
                </a>
              )}
              {lead.source && (
                <span className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" /> {lead.source}
                </span>
              )}
              <span>Added {fmtDate(lead.created_at)}</span>
              <span>Last seen {relTime(lead.last_seen_at)}</span>
            </div>

            {/* Tags */}
            {lead.tags && lead.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lead.tags.map((t) => (
                  <span key={t} className="rounded-full border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-0.5 text-[11px] text-[var(--text-3)]">{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Export + nav buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {/* LTV + metrics row */}
        <div className="grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-4">
          <div className="space-y-0.5">
            <p className="text-[11px] text-[var(--text-3)]">LTV (Collected)</p>
            <p className="font-mono text-base font-semibold text-[var(--brand)]">{formatInr(totalLtv || lead.ltv_inr)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[11px] text-[var(--text-3)]">Bookings</p>
            <p className="font-mono text-base font-semibold text-[var(--text)]">{bookings.length}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[11px] text-[var(--text-3)]">Payments</p>
            <p className="font-mono text-base font-semibold text-[var(--text)]">{payments.length}</p>
          </div>
        </div>
      </div>

      {/* ── ACTIVITY TIMELINE ─────────────────────────────────── */}
      <Section title="Activity Timeline" icon={Clock}>
        <div className="pt-3">
          {timeline.length === 0 ? (
            <p className="text-sm text-[var(--text-3)] py-4 text-center">No activity yet.</p>
          ) : (
            <div>
              {timeline.map((item, i) => (
                <TimelineRow key={`${item.kind}-${i}`} item={item} orgSlug={orgSlug} />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── BOOKINGS ──────────────────────────────────────────── */}
      <Section title={`Bookings (${bookings.length})`} icon={Calendar}>
        <div className="pt-3 space-y-3">
          {bookings.length === 0 && <p className="text-sm text-[var(--text-3)] py-2">No bookings.</p>}
          {bookings.map((b) => {
            const cfg = {
              completed: { color: "text-[var(--brand)]", bg: "bg-[var(--brand)]/10", icon: CheckCircle2 },
              confirmed: { color: "text-emerald-400",    bg: "bg-emerald-500/10",    icon: Calendar },
              no_show:   { color: "text-red-400",         bg: "bg-red-500/10",        icon: AlertTriangle },
              cancelled: { color: "text-[var(--text-3)]", bg: "bg-[var(--bg-3)]",    icon: XCircle },
            }[b.status] ?? { color: "text-[var(--text-3)]", bg: "bg-[var(--bg-3)]", icon: Clock };
            const Icon = cfg.icon;
            return (
              <div key={b.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-3)] p-4 flex items-start gap-3">
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", cfg.bg)}>
                  <Icon className={cn("h-4 w-4", cfg.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-xs font-semibold", cfg.color)}>{b.status.replace("_", " ").toUpperCase()}</span>
                    {b.attendee_name && <span className="text-sm text-[var(--text)]">{b.attendee_name}</span>}
                  </div>
                  <p className="text-xs text-[var(--text-3)]">{fmtDate(b.starts_at)}</p>
                  {b.attendee_email && <p className="text-xs text-[var(--text-3)]">{b.attendee_email}</p>}
                </div>
                {b.meeting_url && (
                  <a href={b.meeting_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-[var(--brand)] hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Join
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── PAYMENTS ──────────────────────────────────────────── */}
      <Section title={`Payments (${payments.length})`} icon={CreditCard}>
        <div className="pt-3 space-y-3">
          {payments.length === 0 && <p className="text-sm text-[var(--text-3)] py-2">No payments.</p>}
          {/* LTV summary */}
          {payments.length > 0 && (
            <div className="flex items-center gap-4 rounded-[var(--radius-sm)] bg-[var(--brand)]/5 border border-[var(--brand)]/15 px-4 py-2.5">
              <div>
                <p className="text-[11px] text-[var(--text-3)]">Total collected</p>
                <p className="font-mono text-base font-semibold text-[var(--brand)]">{formatInr(totalLtv)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-3)]">Pending</p>
                <p className="font-mono text-base font-semibold text-amber-400">
                  {formatInr(payments.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount_inr, 0))}
                </p>
              </div>
            </div>
          )}
          {payments.map((p) => (
            <div key={p.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-3)] p-4 flex items-start gap-3">
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", p.status === "paid" ? "bg-[var(--brand)]/15" : "bg-amber-500/10")}>
                <CreditCard className={cn("h-4 w-4", p.status === "paid" ? "text-[var(--brand)]" : "text-amber-400")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-[var(--text)]">{formatInr(p.amount_inr)}</span>
                  <span className={cn("text-xs font-medium", p.status === "paid" ? "text-[var(--brand)]" : "text-amber-400")}>{p.status}</span>
                  {p.deleted_at && <span className="text-[11px] text-[var(--text-3)] italic">(archived)</span>}
                </div>
                <p className="text-xs text-[var(--text-3)]">{fmtDate(p.created_at)}</p>
                {p.notes && <p className="text-xs text-[var(--text-3)] mt-0.5">{p.notes}</p>}
              </div>
              {p.payment_link_url && (
                <a href={p.payment_link_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-[var(--brand)] hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Link
                </a>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── NOTES ─────────────────────────────────────────────── */}
      <Section title="Notes" icon={StickyNote}>
        <div className="pt-3 space-y-3">
          {editNotes ? (
            <>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                className={cn(
                  "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)]",
                  "px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)]",
                  "focus:outline-none focus:ring-1 focus:ring-[var(--brand)]",
                  "resize-y"
                )}
                placeholder="Add notes about this lead…"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--brand)] text-[#0A0A0C] px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <Save className="h-3.5 w-3.5" /> {savingNotes ? "Saving…" : "Save notes"}
                </button>
                <button
                  onClick={() => { setNotes(lead.notes ?? ""); setEditNotes(false); }}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-3)] hover:bg-[var(--bg-3)] transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {notes ? (
                <p className="text-sm text-[var(--text-2)] whitespace-pre-wrap leading-relaxed">{notes}</p>
              ) : (
                <p className="text-sm text-[var(--text-3)] italic">No notes yet.</p>
              )}
              <button
                onClick={() => setEditNotes(true)}
                className="flex items-center gap-1.5 text-xs text-[var(--text-3)] hover:text-[var(--brand)] transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" /> {notes ? "Edit notes" : "Add notes"}
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* ── CONVERSATIONS ─────────────────────────────────────── */}
      <Section title={`Conversations (${conversations.length})`} icon={MessageSquare} defaultOpen={false}>
        <div className="pt-3 space-y-2">
          {conversations.length === 0 && <p className="text-sm text-[var(--text-3)] py-2">No conversations.</p>}
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/org/${orgSlug}/inbox/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-3)] p-3 hover:bg-[var(--bg-2)] transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--text-2)]">
                  {c.channel_provider.replace("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase())}
                  <span className="ml-2 text-[var(--text-3)]">{relTime(c.last_message_at)}</span>
                </p>
                {c.last_message_preview && (
                  <p className="text-xs text-[var(--text-3)] truncate">{c.last_message_preview}</p>
                )}
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-[var(--text-3)] group-hover:text-[var(--brand)] shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
