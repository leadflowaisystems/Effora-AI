"use client";

import * as React from "react";
import {
  Users, Plus, X, Trash2, Send, Clock, Instagram, Phone, MessageSquare,
  ChevronLeft, Loader2, Check, CheckCircle2, AlertTriangle, RefreshCw,
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

type Tab = "members" | "broadcasts" | "compose" | "settings";

/* ─── Channel badge ──────────────────────────────────────────────── */
function ChannelBadge({ channel }: { channel: string }) {
  if (channel === "instagram") return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20"><Instagram className="h-2.5 w-2.5" /> Instagram</span>;
  if (channel === "whatsapp")  return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] border border-[var(--brand)]/20"><Phone className="h-2.5 w-2.5" /> WhatsApp</span>;
  return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20"><MessageSquare className="h-2.5 w-2.5" /> Both</span>;
}

/* ─── Status badge ───────────────────────────────────────────────── */
const STATUS_STYLES: Record<string, string> = {
  queued:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  running:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20",
  failed:    "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled: "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]",
};

/* ─── Main component ─────────────────────────────────────────────── */
export function GroupDetailView({ orgId, orgSlug, group, initialMembers, initialBroadcasts, waTemplates }: Props) {
  const router = useRouter();
  const [tab,        setTab]       = React.useState<Tab>("members");
  const [members,    setMembers]   = React.useState<Member[]>(initialMembers);
  const [broadcasts, setBroadcasts] = React.useState<Broadcast[]>(initialBroadcasts);

  // Members tab state
  const [addSearch,    setAddSearch]    = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Lead[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [addingLeads,   setAddingLeads]   = React.useState<string[]>([]);
  const [removingId,    setRemovingId]    = React.useState<string | null>(null);
  const [showAddSearch, setShowAddSearch] = React.useState(false);

  // Compose tab state
  const [composeMsg,       setComposeMsg]       = React.useState("");
  const [composeChannel,   setComposeChannel]   = React.useState<string>(group.channel === "both" ? "whatsapp" : group.channel);
  const [composeTemplateId, setComposeTemplateId] = React.useState("");
  const [scheduledAt,      setScheduledAt]      = React.useState("");
  const [composeSending,   setComposeSending]   = React.useState(false);
  const [composeError,     setComposeError]     = React.useState<string | null>(null);
  const [composeSent,      setComposeSent]      = React.useState(false);

  // Settings tab state
  const [settingsName, setSettingsName] = React.useState(group.name);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [deleting,       setDeleting]       = React.useState(false);

  // Search leads to add
  React.useEffect(() => {
    if (!addSearch.trim() || addSearch.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/leads?search=${encodeURIComponent(addSearch)}&limit=10`);
        const data = await res.json();
        const existingIds = new Set(members.map((m) => m.lead_id));
        setSearchResults((data.leads ?? []).filter((l: Lead) => !existingIds.has(l.id)));
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [addSearch, members, orgId]);

  async function addMember(leadId: string) {
    setAddingLeads((a) => [...a, leadId]);
    try {
      const res = await fetch(`/api/orgs/${orgId}/groups/${group.id}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: [leadId] }),
      });
      if (res.ok) {
        const lead = searchResults.find((l) => l.id === leadId);
        if (lead) {
          setMembers((m) => [{ lead_id: leadId, added_at: new Date().toISOString(), lead }, ...m]);
          setSearchResults((r) => r.filter((l) => l.id !== leadId));
        }
      }
    } finally {
      setAddingLeads((a) => a.filter((id) => id !== leadId));
    }
  }

  async function removeMember(leadId: string) {
    if (!confirm("Remove this member from the group?")) return;
    setRemovingId(leadId);
    try {
      await fetch(`/api/orgs/${orgId}/groups/${group.id}/members/${leadId}`, { method: "DELETE" });
      setMembers((m) => m.filter((x) => x.lead_id !== leadId));
    } finally {
      setRemovingId(null);
    }
  }

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!composeMsg.trim()) return;
    if (!confirm(`Send to ${members.length} member(s)?`)) return;
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
      setTimeout(() => { setComposeSent(false); setTab("broadcasts"); }, 1500);
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

  // Auto-fill compose message from template
  function applyTemplate(tpl: WaTemplate) {
    setComposeMsg(tpl.body);
    setComposeTemplateId(tpl.id);
    setComposeChannel("whatsapp");
  }

  const inputCls = "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";
  const tabBtn = (t: Tab, label: string) => (
    <button key={t} onClick={() => setTab(t)}
      className={cn(
        "px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-colors whitespace-nowrap",
        tab === t ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--bg-2)]"
      )}>{label}</button>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Back + Header */}
      <div className="space-y-3">
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
      <div className="flex gap-1 border-b border-[var(--border)] pb-0 overflow-x-auto scrollbar-none">
        {tabBtn("members",    `Members (${members.length})`)}
        {tabBtn("broadcasts", `Broadcasts (${broadcasts.length})`)}
        {tabBtn("compose",    "Compose")}
        {tabBtn("settings",   "Settings")}
      </div>

      {/* ── Members tab ── */}
      {tab === "members" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-3)]">{members.length} member{members.length !== 1 ? "s" : ""} in this group</p>
            <Button variant="secondary" size="sm" onClick={() => setShowAddSearch(!showAddSearch)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Members
            </Button>
          </div>

          {showAddSearch && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-3 space-y-2">
              <input
                value={addSearch} onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search by name, IG handle, phone…"
                className={inputCls}
                autoFocus
              />
              {searchLoading && <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-[var(--text-3)]" /></div>}
              {!searchLoading && searchResults.length === 0 && addSearch.trim().length > 1 && (
                <p className="text-xs text-[var(--text-3)] text-center py-2">No results</p>
              )}
              {searchResults.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-3)] px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-[var(--text)]">{lead.name ?? lead.external_id}</p>
                    <p className="text-[10px] text-[var(--text-3)]">{lead.stage} · {lead.channel}</p>
                  </div>
                  <button
                    onClick={() => addMember(lead.id)}
                    disabled={addingLeads.includes(lead.id)}
                    className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--brand)] px-2 py-1 text-[10px] font-medium text-[#0A0A0C] hover:opacity-90 disabled:opacity-50"
                  >
                    {addingLeads.includes(lead.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}

          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Users className="h-8 w-8 text-[var(--text-3)]" />
              <p className="text-xs text-[var(--text-3)]">No members yet. Add leads to this group.</p>
            </div>
          ) : (
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
                      onClick={() => removeMember(m.lead_id)}
                      disabled={removingId === m.lead_id}
                      className="shrink-0 text-[var(--text-3)] hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {removingId === m.lead_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Broadcasts tab ── */}
      {tab === "broadcasts" && (
        <div className="space-y-2">
          {broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Send className="h-8 w-8 text-[var(--text-3)]" />
              <p className="text-xs text-[var(--text-3)]">No broadcasts yet. Go to Compose to send your first one.</p>
              <Button variant="primary" size="sm" onClick={() => setTab("compose")}>Compose Broadcast</Button>
            </div>
          ) : broadcasts.map((b) => (
            <div key={b.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-[var(--text-2)] line-clamp-2 flex-1">{b.message_template}</p>
                <span className={cn("shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border", STATUS_STYLES[b.status] ?? STATUS_STYLES.queued)}>
                  {b.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-3)]">
                <span>{new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span>{b.total_recipients} recipients</span>
                <span className="text-[var(--brand)]">{b.sent_count} sent</span>
                {b.failed_count > 0 && <span className="text-red-400">{b.failed_count} failed</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Compose tab ── */}
      {tab === "compose" && (
        <form onSubmit={sendBroadcast} className="space-y-4">
          {members.length === 0 && (
            <div className="flex items-start gap-2 rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400/80">Add members to this group before sending a broadcast.</p>
            </div>
          )}

          {/* Channel */}
          {group.channel === "both" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Channel</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["instagram","whatsapp"] as const).map((ch) => (
                  <button key={ch} type="button" onClick={() => setComposeChannel(ch)}
                    className={cn("rounded-[var(--radius-sm)] border py-2 text-xs font-medium transition-colors",
                      composeChannel === ch ? "border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]" : "border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-3)] hover:text-[var(--text-2)]")}>
                    {ch.charAt(0).toUpperCase() + ch.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* WA Templates */}
          {composeChannel === "whatsapp" && waTemplates.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Use a template (approved)</label>
              <div className="space-y-1">
                {waTemplates.map((t) => (
                  <button key={t.id} type="button" onClick={() => applyTemplate(t)}
                    className={cn("w-full flex items-center justify-between rounded-[var(--radius-sm)] border px-3 py-2 text-left text-xs transition-colors",
                      composeTemplateId === t.id ? "border-[var(--brand)]/40 bg-[var(--brand)]/8 text-[var(--text)]" : "border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-2)] hover:bg-[var(--bg-3)]")}>
                    <span>{t.name}</span>
                    {composeTemplateId === t.id && <Check className="h-3.5 w-3.5 text-[var(--brand)]" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {composeChannel === "whatsapp" && (
            <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-400/80">
                Free-form WhatsApp messages only work within 24h of the customer&apos;s last message.
                Outside that window, use an approved template.
              </p>
            </div>
          )}

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">Message</label>
            <p className="text-[10px] text-[var(--text-3)]">Use <code className="font-mono bg-[var(--bg-3)] px-1 rounded">{"{{name}}"}</code> or <code className="font-mono bg-[var(--bg-3)] px-1 rounded">{"{{first_name}}"}</code> for personalization.</p>
            <textarea value={composeMsg} onChange={(e) => setComposeMsg(e.target.value)} rows={4} required
              placeholder={"Hi {{first_name}}, just a quick reminder about your session tomorrow…"}
              className={cn(inputCls, "resize-none")} />
          </div>

          {/* Preview */}
          {composeMsg && members.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Preview (first recipient)</label>
              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-xs text-[var(--text-2)] leading-relaxed">
                {composeMsg.replace(/\{\{name\}\}/gi, members[0].lead.name ?? "there").replace(/\{\{first_name\}\}/gi, (members[0].lead.name ?? "there").split(/\s+/)[0])}
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">
              <Clock className="h-3 w-3 inline mr-1" />
              Schedule for later <span className="text-[var(--text-3)] font-normal">(optional — leave blank to send now)</span>
            </label>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
              className={inputCls} min={new Date().toISOString().slice(0,16)} />
          </div>

          {composeError && <p className="text-xs text-red-400">{composeError}</p>}

          {composeSent && (
            <div className="flex items-center gap-2 text-[var(--brand)] text-sm">
              <CheckCircle2 className="h-4 w-4" /> Broadcast queued for {members.length} recipients
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full gap-2"
            disabled={!composeMsg.trim() || members.length === 0 || composeSending}>
            {composeSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {scheduledAt
              ? `Schedule for ${new Date(scheduledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : `Send to ${members.length} member${members.length !== 1 ? "s" : ""} now`}
          </Button>
        </form>
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
  );
}
