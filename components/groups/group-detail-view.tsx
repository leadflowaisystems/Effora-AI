"use client";

import * as React from "react";
import {
  Users, Plus, X, Trash2, Send, Instagram, Phone, MessageSquare,
  ChevronLeft, Loader2, Check, CheckCircle2, AlertTriangle, Clock,
  ChevronDown, ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ─── Types ──────────────────────────────────────────────────────── */
interface Lead {
  id:                string;
  name:              string | null;
  external_id:       string;
  channel:           string;
  stage:             string;
  score:             number;
  phone?:            string | null;
  instagram_handle?: string | null;
  metadata?:         Record<string, unknown> | null;
}
interface Member { lead_id: string; added_at: string; lead: Lead }
interface Broadcast {
  id:               string;
  channel:          string;
  message_template: string;
  status:           string;
  created_at:       string;
  total_recipients: number;
  sent_count:       number;
  failed_count:     number;
}
interface WaTemplate { id: string; name: string; body: string; variables: string[] }
interface Group {
  id:          string;
  name:        string;
  tag:         string;
  channel:     "instagram" | "whatsapp" | "both";
  description: string | null;
  created_at:  string;
}
interface Props {
  orgId:             string;
  orgSlug:           string;
  group:             Group;
  initialMembers:    Member[];
  initialBroadcasts: Broadcast[];
  waTemplates:       WaTemplate[];
}

type Tab = "members" | "broadcasts" | "settings";

/* ─── Channel badge ──────────────────────────────────────────────── */
function ChannelBadge({ channel }: { channel: string }) {
  if (channel === "instagram" || channel === "meta_instagram")
    return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20"><Instagram className="h-2.5 w-2.5" /> Instagram</span>;
  if (channel === "whatsapp" || channel === "whatsapp_cloud")
    return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] border border-[var(--brand)]/20"><Phone className="h-2.5 w-2.5" /> WhatsApp</span>;
  return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20"><MessageSquare className="h-2.5 w-2.5" /> Both</span>;
}

/* ─── Broadcast status badge ─────────────────────────────────────── */
const STATUS_STYLES: Record<string, string> = {
  queued:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  running:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20",
  failed:    "bg-red-500/10 text-red-400 border-red-500/20",
};

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60)   return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400)return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

/* ─── Member Picker ──────────────────────────────────────────────── */
function MemberPicker({ orgId, group, members, onAdd, onRemove }: {
  orgId:    string;
  group:    Group;
  members:  Member[];
  onAdd:    (lead: Lead) => void;
  onRemove: (leadId: string) => void;
}) {
  const [allLeads,    setAllLeads]    = React.useState<Lead[]>([]);
  const [search,      setSearch]      = React.useState("");
  const [loading,     setLoading]     = React.useState(false);
  const [cursor,      setCursor]      = React.useState<string | null>(null);
  const [hasMore,     setHasMore]     = React.useState(true);
  const [pendingIds,  setPendingIds]  = React.useState<Set<string>>(new Set());

  const memberIds = React.useMemo(() => new Set(members.map((m) => m.lead_id)), [members]);

  // Initial load
  React.useEffect(() => {
    loadLeads(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search
  React.useEffect(() => {
    const t = setTimeout(() => loadLeads(true), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function loadLeads(reset = false) {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "50" });
      if (search.trim()) p.set("search", search.trim());
      if (!reset && cursor) p.set("cursor", cursor);
      const res  = await fetch(`/api/orgs/${orgId}/leads?${p}`);
      const data = await res.json();
      const rows: Lead[] = data.leads ?? [];
      setAllLeads((prev) => reset ? rows : [...prev, ...rows]);
      setCursor(data.next_cursor ?? null);
      setHasMore(!!data.next_cursor);
    } finally {
      setLoading(false);
    }
  }

  function isCompatible(lead: Lead): boolean {
    if (group.channel === "both") return true;
    if (group.channel === "whatsapp") {
      return !!(lead.phone ?? (lead.metadata?.phone as string | null));
    }
    if (group.channel === "instagram") {
      return lead.channel === "instagram" || lead.channel === "meta_instagram";
    }
    return true;
  }

  async function toggle(lead: Lead) {
    if (pendingIds.has(lead.id)) return;
    setPendingIds((s) => { const n = new Set(s); n.add(lead.id); return n; });
    try {
      if (memberIds.has(lead.id)) {
        await fetch(`/api/orgs/${orgId}/groups/${group.id}/members/${lead.id}`, { method: "DELETE" });
        onRemove(lead.id);
      } else {
        const res = await fetch(`/api/orgs/${orgId}/groups/${group.id}/members`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_ids: [lead.id] }),
        });
        if (res.ok) onAdd(lead);
      }
    } finally {
      setPendingIds((s) => { const n = new Set(s); n.delete(lead.id); return n; });
    }
  }

  return (
    <div className="space-y-3">
      <input
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, handle, phone…"
        className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
        autoFocus
      />

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
        {loading && allLeads.length === 0 && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--text-3)]" />
          </div>
        )}
        {!loading && allLeads.length === 0 && (
          <p className="text-xs text-[var(--text-3)] text-center py-6">No leads found</p>
        )}
        {allLeads.map((lead) => {
          const isMember  = memberIds.has(lead.id);
          const compatible = isCompatible(lead);
          const pending    = pendingIds.has(lead.id);
          const phone = lead.phone ?? (lead.metadata?.phone as string | null) ?? null;
          const ig    = lead.instagram_handle ?? (lead.metadata?.instagram_handle as string | null) ?? null;

          return (
            <div
              key={lead.id}
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-2.5 border-b border-[var(--border)] last:border-0",
                !compatible && !isMember ? "opacity-50" : ""
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text)] truncate">{lead.name ?? lead.external_id}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {ig && <span className="flex items-center gap-0.5 text-[10px] text-pink-400"><Instagram className="h-2.5 w-2.5" />@{ig.replace(/^@/,"")}</span>}
                  {phone && <span className="flex items-center gap-0.5 text-[10px] text-[var(--brand)]"><Phone className="h-2.5 w-2.5" />{phone}</span>}
                  {!ig && !phone && <span className="text-[10px] text-[var(--text-3)]">{lead.channel}</span>}
                  {!compatible && !isMember && (
                    <span className="text-[10px] text-[var(--text-3)]">
                      · No {group.channel === "whatsapp" ? "phone" : "IG"} — cannot add
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => compatible || isMember ? toggle(lead) : undefined}
                disabled={pending || (!compatible && !isMember)}
                className={cn(
                  "shrink-0 flex items-center gap-1 rounded-[var(--radius-sm)] px-2.5 py-1 text-[10px] font-medium transition-colors",
                  isMember
                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                    : compatible
                    ? "bg-[var(--brand)]/10 text-[var(--brand)] hover:bg-[var(--brand)]/20 border border-[var(--brand)]/20"
                    : "bg-[var(--bg-3)] text-[var(--text-3)] border border-[var(--border)] cursor-not-allowed"
                )}
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : isMember ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {pending ? "" : isMember ? "Remove" : "Add"}
              </button>
            </div>
          );
        })}

        {hasMore && !loading && (
          <button
            onClick={() => loadLeads(false)}
            className="w-full py-2.5 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
          >
            Load more
          </button>
        )}
        {loading && allLeads.length > 0 && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-3 w-3 animate-spin text-[var(--text-3)]" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Broadcast bubble ────────────────────────────────────────────── */
function BroadcastBubble({ b }: { b: Broadcast }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-1">
        <div
          className="rounded-[var(--radius-lg)] rounded-br-sm bg-[var(--brand)]/10 border border-[var(--brand)]/20 px-3.5 py-2.5 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">{b.message_template}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-3)]">
              <span>→ {b.total_recipients} recipients</span>
              {b.sent_count > 0 && <span className="text-[var(--brand)]">✓ {b.sent_count} sent</span>}
              {b.failed_count > 0 && <span className="text-red-400">✗ {b.failed_count} failed</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", STATUS_STYLES[b.status] ?? STATUS_STYLES.queued)}>
                {b.status}
              </span>
              {expanded ? <ChevronUp className="h-3 w-3 text-[var(--text-3)]" /> : <ChevronDown className="h-3 w-3 text-[var(--text-3)]" />}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-[var(--text-3)] text-right">{timeAgo(b.created_at)}</p>

        {/* Expanded delivery detail */}
        {expanded && (
          <BroadcastDeliveries broadcastId={b.id} />
        )}
      </div>
    </div>
  );
}

function BroadcastDeliveries({ broadcastId }: { broadcastId: string }) {
  const [deliveries, setDeliveries] = React.useState<Array<{
    id: string; status: string; failed_reason: string | null;
    lead: { name: string | null; external_id: string } | null;
  }>>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`/api/broadcasts/${broadcastId}/deliveries`)
      .then((r) => r.json())
      .then((d) => setDeliveries(d.deliveries ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [broadcastId]);

  if (loading) return <div className="flex justify-center py-2"><Loader2 className="h-3 w-3 animate-spin text-[var(--text-3)]" /></div>;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] overflow-hidden max-h-48 overflow-y-auto">
      {deliveries.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)] last:border-0">
          <p className="text-[11px] text-[var(--text-2)] truncate">{d.lead?.name ?? d.lead?.external_id ?? "Unknown"}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn("text-[10px]",
              d.status === "sent" || d.status === "delivered" ? "text-[var(--brand)]" :
              d.status === "failed" ? "text-red-400" :
              d.status === "skipped" ? "text-amber-400" : "text-[var(--text-3)]"
            )}>
              {d.status}
            </span>
            {d.failed_reason && (
              <span className="text-[9px] text-[var(--text-3)] max-w-[120px] truncate" title={d.failed_reason}>
                ({d.failed_reason})
              </span>
            )}
          </div>
        </div>
      ))}
      {deliveries.length === 0 && (
        <p className="text-[11px] text-[var(--text-3)] text-center py-3">No delivery records yet</p>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export function GroupDetailView({ orgId, orgSlug, group, initialMembers, initialBroadcasts, waTemplates }: Props) {
  const router = useRouter();
  const [tab,        setTab]        = React.useState<Tab>("members");
  const [members,    setMembers]    = React.useState<Member[]>(initialMembers);
  const [broadcasts, setBroadcasts] = React.useState<Broadcast[]>(initialBroadcasts);
  const [showPicker, setShowPicker] = React.useState(false);

  // Compose state (inline at bottom of broadcasts tab)
  const [composeMsg,        setComposeMsg]        = React.useState("");
  const [composeChannel,    setComposeChannel]    = React.useState<string>(group.channel === "both" ? "whatsapp" : group.channel);
  const [composeTemplateId, setComposeTemplateId] = React.useState("");
  const [scheduledAt,       setScheduledAt]       = React.useState("");
  const [composeSending,    setComposeSending]    = React.useState(false);
  const [composeError,      setComposeError]      = React.useState<string | null>(null);
  const [composeSent,       setComposeSent]       = React.useState(false);
  const [showCompose,       setShowCompose]       = React.useState(false);

  // Settings state
  const [settingsName,   setSettingsName]   = React.useState(group.name);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [deleting,       setDeleting]       = React.useState(false);

  const composeBottomRef = React.useRef<HTMLDivElement>(null);

  function handleAddMember(lead: Lead) {
    setMembers((m) => {
      if (m.some((x) => x.lead_id === lead.id)) return m;
      return [{ lead_id: lead.id, added_at: new Date().toISOString(), lead }, ...m];
    });
  }

  function handleRemoveMember(leadId: string) {
    setMembers((m) => m.filter((x) => x.lead_id !== leadId));
  }

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!composeMsg.trim()) return;
    if (!confirm(`Send to ${members.length} member(s)?\n\nBy sending this broadcast, you confirm all recipients have consented to receive messages from you. Effora is not responsible for spam violations.`)) return;
    setComposeSending(true);
    setComposeError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/groups/${group.id}/broadcasts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel:          composeChannel,
          message_template: composeMsg,
          template_id:      composeTemplateId || undefined,
          send_at:          scheduledAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setComposeError(data.error ?? "Failed to queue broadcast"); return; }
      setComposeSent(true);
      setBroadcasts((b) => [data.broadcast, ...b]);
      setComposeMsg(""); setScheduledAt(""); setComposeTemplateId("");
      setTimeout(() => { setComposeSent(false); setShowCompose(false); }, 2000);
    } finally {
      setComposeSending(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      await fetch(`/api/orgs/${orgId}/groups/${group.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: settingsName }),
      });
    } finally {
      setSettingsSaving(false);
    }
  }

  async function deleteGroup() {
    if (!confirm(`Delete "${group.name}"? All members and broadcast history will be removed. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/orgs/${orgId}/groups/${group.id}`, { method: "DELETE" });
      router.push(`/org/${orgSlug}/groups`);
    } finally {
      setDeleting(false);
    }
  }

  function applyTemplate(tpl: WaTemplate) {
    setComposeMsg(tpl.body);
    setComposeTemplateId(tpl.id);
    setComposeChannel("whatsapp");
  }

  const inputCls = "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";
  const tabBtn = (t: Tab, label: string, count?: number) => (
    <button key={t} onClick={() => setTab(t)}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-colors whitespace-nowrap",
        tab === t ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--bg-2)]"
      )}>
      {label}{count !== undefined ? ` (${count})` : ""}
    </button>
  );

  return (
    <div className="flex flex-col h-full space-y-0 max-w-3xl">
      {/* Back + Header */}
      <div className="space-y-3 pb-4">
        <Link href={`/org/${orgSlug}/groups`}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors w-fit">
          <ChevronLeft className="h-3.5 w-3.5" /> Groups
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold text-[var(--text)]">{group.name}</h1>
              <ChannelBadge channel={group.channel} />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-[var(--text-3)] font-mono">#{group.tag}</span>
              <span className="text-xs text-[var(--text-3)]">{members.length} member{members.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] pb-0 overflow-x-auto scrollbar-none shrink-0">
        {tabBtn("members",    "Members",    members.length)}
        {tabBtn("broadcasts", "Broadcasts", broadcasts.length)}
        {tabBtn("settings",   "Settings")}
      </div>

      <div className="pt-4 flex-1 overflow-y-auto">

        {/* ── Members tab ── */}
        {tab === "members" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--text-3)]">
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
              <Button variant="secondary" size="sm" onClick={() => setShowPicker(!showPicker)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {showPicker ? "Done" : "Add Members"}
              </Button>
            </div>

            {showPicker && (
              <div className="rounded-[var(--radius-lg)] border border-[var(--brand)]/20 bg-[var(--bg-2)] p-3">
                <p className="text-xs font-medium text-[var(--text)] mb-2">Add or remove members</p>
                <MemberPicker
                  orgId={orgId}
                  group={group}
                  members={members}
                  onAdd={handleAddMember}
                  onRemove={handleRemoveMember}
                />
              </div>
            )}

            {members.length === 0 && !showPicker ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Users className="h-8 w-8 text-[var(--text-3)]" />
                <p className="text-xs text-[var(--text-3)]">No members yet. Click &ldquo;Add Members&rdquo; to get started.</p>
              </div>
            ) : !showPicker ? (
              <div className="space-y-1">
                {members.map((m) => {
                  const lead = m.lead;
                  const phone = lead.phone ?? (lead.metadata?.phone as string | null) ?? null;
                  const ig    = lead.instagram_handle ?? (lead.metadata?.instagram_handle as string | null) ?? null;
                  return (
                    <div key={m.lead_id} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text)] truncate">{lead.name ?? lead.external_id}</p>
                        <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                          {ig ? `@${ig.replace(/^@/,"")}` : phone ?? "—"}
                          {" · "}{lead.stage}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (!confirm("Remove this member?")) return;
                          fetch(`/api/orgs/${orgId}/groups/${group.id}/members/${m.lead_id}`, { method: "DELETE" });
                          handleRemoveMember(m.lead_id);
                        }}
                        className="shrink-0 text-[var(--text-3)] hover:text-red-400 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        {/* ── Broadcasts tab — chat-style thread + inline compose ── */}
        {tab === "broadcasts" && (
          <div className="flex flex-col gap-3">
            {/* Compliance banner */}
            <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-500/20 bg-amber-500/5 px-3 py-2 shrink-0">
              <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-400/80 leading-relaxed">
                WhatsApp/Instagram messages can only be sent within the 24-hour customer-initiated window.
                Outside that window, approved templates are required.
                All recipients must have consented to receive your messages.
              </p>
            </div>

            {/* Broadcast thread */}
            {broadcasts.length === 0 && !showCompose ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Send className="h-8 w-8 text-[var(--text-3)]" />
                <p className="text-xs text-[var(--text-3)]">No broadcasts yet.</p>
                <Button variant="primary" size="sm" onClick={() => setShowCompose(true)} disabled={members.length === 0}>
                  Compose first broadcast
                </Button>
                {members.length === 0 && <p className="text-[10px] text-[var(--text-3)]">Add members first</p>}
              </div>
            ) : (
              <div className="space-y-3">
                {[...broadcasts].reverse().map((b) => (
                  <BroadcastBubble key={b.id} b={b} />
                ))}
              </div>
            )}

            <div ref={composeBottomRef} />

            {/* Compose toggle */}
            {!showCompose ? (
              <Button
                variant="primary" size="sm"
                className="self-end gap-1.5 mt-2"
                disabled={members.length === 0}
                onClick={() => { setShowCompose(true); setTimeout(() => composeBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }}
              >
                <Send className="h-3.5 w-3.5" /> New Broadcast
              </Button>
            ) : (
              /* ── Inline compose panel ────────────────────────── */
              <form onSubmit={sendBroadcast} className="rounded-[var(--radius-lg)] border border-[var(--brand)]/20 bg-[var(--bg-2)] p-4 space-y-3 mt-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[var(--text)]">New Broadcast to {members.length} members</p>
                  <button type="button" onClick={() => setShowCompose(false)} className="text-[var(--text-3)] hover:text-[var(--text)]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Channel */}
                {group.channel === "both" && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["instagram","whatsapp"] as const).map((ch) => (
                      <button key={ch} type="button" onClick={() => setComposeChannel(ch)}
                        className={cn("rounded-[var(--radius-sm)] border py-1.5 text-xs font-medium transition-colors",
                          composeChannel === ch ? "border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]" : "border-[var(--border)] bg-[var(--bg-3)] text-[var(--text-3)]")}>
                        {ch.charAt(0).toUpperCase() + ch.slice(1)}
                      </button>
                    ))}
                  </div>
                )}

                {/* WA templates */}
                {composeChannel === "whatsapp" && waTemplates.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-[var(--text-3)]">Approved templates (required outside 24h window):</p>
                    {waTemplates.map((t) => (
                      <button key={t.id} type="button" onClick={() => applyTemplate(t)}
                        className={cn("w-full flex items-center justify-between rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-left text-[11px] transition-colors",
                          composeTemplateId === t.id ? "border-[var(--brand)]/40 bg-[var(--brand)]/8 text-[var(--text)]" : "border-[var(--border)] bg-[var(--bg-3)] text-[var(--text-2)] hover:bg-[var(--bg-2)]")}>
                        {t.name}
                        {composeTemplateId === t.id && <Check className="h-3 w-3 text-[var(--brand)]" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* Message */}
                <div>
                  <p className="text-[10px] text-[var(--text-3)] mb-1">
                    Use <code className="font-mono bg-[var(--bg-3)] px-0.5 rounded">{"{{name}}"}</code> or <code className="font-mono bg-[var(--bg-3)] px-0.5 rounded">{"{{first_name}}"}</code> for personalization.
                  </p>
                  <textarea value={composeMsg} onChange={(e) => setComposeMsg(e.target.value)} rows={3} required
                    placeholder={"Hi {{first_name}}, quick reminder about tomorrow's session…"}
                    className={cn(inputCls, "resize-none text-sm")} />
                </div>

                {/* Preview */}
                {composeMsg && members.length > 0 && (
                  <div className="rounded-[var(--radius-sm)] bg-[var(--bg-3)] border border-[var(--border)] px-2.5 py-2 text-[11px] text-[var(--text-2)] leading-relaxed">
                    <span className="text-[10px] text-[var(--text-3)] block mb-1">Preview for {members[0].lead.name ?? "first member"}:</span>
                    {composeMsg.replace(/\{\{name\}\}/gi, members[0].lead.name ?? "there").replace(/\{\{first_name\}\}/gi, (members[0].lead.name ?? "there").split(/\s+/)[0])}
                  </div>
                )}

                {/* Schedule */}
                <div>
                  <label className="flex items-center gap-1 text-[10px] text-[var(--text-3)] mb-1">
                    <Clock className="h-2.5 w-2.5" /> Schedule for later (optional)
                  </label>
                  <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                    className={cn(inputCls, "text-xs")} min={new Date().toISOString().slice(0,16)} />
                </div>

                {composeError && <p className="text-xs text-red-400">{composeError}</p>}
                {composeSent && (
                  <div className="flex items-center gap-2 text-[var(--brand)] text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Broadcast queued for {members.length} recipients!
                  </div>
                )}

                <Button type="submit" variant="primary" className="w-full gap-2"
                  disabled={!composeMsg.trim() || members.length === 0 || composeSending}>
                  {composeSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {scheduledAt
                    ? `Schedule for ${new Date(scheduledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                    : `Send to ${members.length} now`}
                </Button>
              </form>
            )}
          </div>
        )}

        {/* ── Settings tab ── */}
        {tab === "settings" && (
          <div className="space-y-5">
            <form onSubmit={saveSettings} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Group name</label>
                <input value={settingsName} onChange={(e) => setSettingsName(e.target.value)} className={inputCls} />
              </div>
              <Button type="submit" variant="primary" size="sm" disabled={settingsSaving}>
                {settingsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {settingsSaving ? "Saving…" : "Save Changes"}
              </Button>
            </form>

            <div className="border-t border-[var(--border)] pt-5 space-y-2">
              <p className="text-xs font-medium text-red-400">Danger Zone</p>
              <p className="text-xs text-[var(--text-3)]">Deleting a group removes all members and broadcast history. Leads themselves are not deleted.</p>
              <Button variant="destructive" size="sm" onClick={deleteGroup} disabled={deleting} className="gap-1.5">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {deleting ? "Deleting…" : "Delete Group"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
