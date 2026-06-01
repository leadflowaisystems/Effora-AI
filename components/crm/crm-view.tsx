"use client";

import * as React from "react";
import {
  Search, Plus, Download, X, Loader2, MoreHorizontal,
  MessageSquare, Calendar, CreditCard, StickyNote, FileText,
  Phone, Instagram, ChevronRight, RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

/* ─── Types ────────────────────────────────────────────────────── */
export interface LeadRow {
  id:          string;
  name:        string | null;
  external_id: string;
  channel:     string;
  score:       number;
  stage:       string;
  tags?:       string[] | null;
  notes?:      string | null;
  ltv_inr?:    number | null;
  last_seen_at?: string | null;
  created_at:  string;
  source?:     string | null;
  metadata?:   Record<string, unknown> | null;
}

interface ActivityData {
  conversation_id: string | null;
  messages:  MsgRow[];
  bookings:  BookingRow[];
  payments:  PaymentRow[];
}
interface MsgRow     { id: string; direction: string; content: string; sent_at: string }
interface BookingRow { id: string; starts_at: string; status: string; meeting_url?: string | null; notes?: string | null }
interface PaymentRow { id: string; amount_inr: number; status: string; payment_link_url?: string | null; link_url?: string | null; payment_method?: string | null; notes?: string | null; created_at: string }

interface Props {
  orgId:        string;
  orgSlug:      string;
  initialLeads: LeadRow[];
}

/* ─── Constants ─────────────────────────────────────────────────── */
const STAGE_COLORS: Record<string, string> = {
  cold:         "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]",
  warm:         "bg-amber-500/20 text-amber-400 border-amber-500/30",
  hot:          "bg-red-500/20 text-red-400 border-red-500/30",
  booking_sent: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  booked:       "bg-[var(--brand)]/20 text-[var(--brand)] border-[var(--brand)]/30",
  won:          "bg-[var(--brand)]/30 text-[var(--brand)] border-[var(--brand)]/40",
  paid:         "bg-[var(--brand)]/40 text-[var(--brand)] border-[var(--brand)]/50",
  lost:         "bg-[var(--bg-3)] text-[var(--text-3)] border-[var(--border)]",
};
const STAGES    = ["cold","warm","hot","booking_sent","booked","won","paid","lost"];
const SORT_OPTS = [
  { value: "last_seen_at", label: "Recent activity" },
  { value: "created_at",   label: "Newest first"    },
  { value: "score",        label: "Highest score"   },
  { value: "ltv_inr",      label: "Highest LTV"     },
];
const SOURCES   = ["Manual","Referral","Event","Other"];

/* ─── Helpers ────────────────────────────────────────────────────── */
function scoreColor(s: number) {
  if (s >= 75) return "text-red-400";
  if (s >= 50) return "text-amber-400";
  return "text-[var(--text-3)]";
}
function relativeTime(iso?: string | null) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function fmtInr(n?: number | null) {
  if (!n) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}
function getPhone(lead: LeadRow): string | null {
  return (lead.metadata?.phone as string | null) ?? null;
}
function getIgHandle(lead: LeadRow): string | null {
  const h = (lead.metadata?.instagram_handle as string | null) ?? null;
  if (h) return h.startsWith("@") ? h : `@${h}`;
  if (lead.channel === "instagram") {
    const clean = lead.external_id.replace(/_[0-9a-f]{8}$/, "").replace(/^ig_/, "");
    if (clean && !clean.startsWith("manual_")) return `@${clean}`;
  }
  return null;
}

const inputCls = "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

/* ─── Main component ─────────────────────────────────────────────── */
export function CrmView({ orgId, orgSlug, initialLeads }: Props) {
  const router = useRouter();
  const [leads,       setLeads]       = React.useState<LeadRow[]>(initialLeads);
  const [search,      setSearch]      = React.useState("");
  const [stageFilter, setStageFilter] = React.useState("");
  const [sortBy,      setSortBy]      = React.useState("last_seen_at");
  const [loading,     setLoading]     = React.useState(false);
  const [selected,    setSelected]    = React.useState<LeadRow | null>(null);
  const [showAdd,     setShowAdd]     = React.useState(false);
  const [nextCursor,  setNextCursor]  = React.useState<string | null>(null);
  const [menuOpenId,  setMenuOpenId]  = React.useState<string | null>(null);

  // Add lead form state
  const [newName,    setNewName]    = React.useState("");
  const [newHandle,  setNewHandle]  = React.useState("");
  const [newPhone,   setNewPhone]   = React.useState("");
  const [newEmail,   setNewEmail]   = React.useState("");
  const [newStage,   setNewStage]   = React.useState("cold");
  const [newTags,    setNewTags]    = React.useState("");
  const [newNotes,   setNewNotes]   = React.useState("");
  const [newSource,  setNewSource]  = React.useState("Manual");
  const [addError,   setAddError]   = React.useState<string | null>(null);
  const [saving,     setSaving]     = React.useState(false);

  async function fetchLeads(reset = true) {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "50", sort: sortBy });
      if (search)                   p.set("search",  search);
      if (stageFilter)              p.set("stage",   stageFilter);
      if (!reset && nextCursor)     p.set("cursor",  nextCursor);
      const res  = await fetch(`/api/orgs/${orgId}/leads?${p}`);
      const data = await res.json();
      if (reset) setLeads(data.leads ?? []);
      else       setLeads((prev) => [...prev, ...(data.leads ?? [])]);
      setNextCursor(data.next_cursor ?? null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    const t = setTimeout(() => fetchLeads(true), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stageFilter, sortBy]);

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    if (!newHandle.trim() && !newPhone.trim()) {
      setAddError("Please provide an Instagram handle or phone number.");
      return;
    }
    setSaving(true);
    setAddError(null);
    try {
      const res  = await fetch(`/api/orgs/${orgId}/leads`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    newName,
          handle:  newHandle || undefined,
          phone:   newPhone  || undefined,
          email:   newEmail  || undefined,
          stage:   newStage,
          tags:    newTags ? newTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          notes:   newNotes  || undefined,
          source:  newSource.toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Failed to add lead"); return; }

      setLeads((prev) => [data.lead, ...prev]);
      setShowAdd(false);
      resetAddForm();

      const convId = data.conversation_id as string | null;
      toast({
        title:       "Lead added",
        description: convId ? "Appears in Inbox now." : "Lead saved.",
        ...(convId ? {
          action: (
            <button
              onClick={() => router.push(`/org/${orgSlug}/inbox/${convId}`)}
              className="text-xs font-semibold text-[var(--brand)] hover:underline"
            >
              Open in Inbox
            </button>
          ),
        } : {}),
      } as Parameters<typeof toast>[0]);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  function resetAddForm() {
    setNewName(""); setNewHandle(""); setNewPhone(""); setNewEmail("");
    setNewStage("cold"); setNewTags(""); setNewNotes(""); setNewSource("Manual");
    setAddError(null);
  }

  async function deleteLead(lead: LeadRow) {
    if (!confirm(`Delete "${lead.name ?? "this lead"}"? This cannot be undone.`)) return;
    await fetch(`/api/orgs/${orgId}/leads/${lead.id}`, { method: "DELETE" }).catch(() => null);
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    if (selected?.id === lead.id) setSelected(null);
    toast({ title: "Lead deleted" });
  }

  function exportCsv() {
    const hdrs = ["Name","IG Handle","Phone","Stage","Score","LTV","Last Contact","Tags","Source"];
    const rows = leads.map((l) => [
      l.name ?? "", getIgHandle(l) ?? "", getPhone(l) ?? "",
      l.stage, l.score, l.ltv_inr ?? 0,
      relativeTime(l.last_seen_at), (l.tags ?? []).join(";"), l.source ?? "",
    ]);
    const csv = [hdrs, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a   = document.createElement("a");
    a.href    = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-3)]" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] pl-8 pr-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
        </div>

        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]">
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_"," ")}</option>)}
        </select>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          className="hidden sm:block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]">
          {SORT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <button onClick={exportCsv}
          className="hidden sm:flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">
          <Download className="h-3.5 w-3.5" /> Export
        </button>

        <button onClick={() => { setShowAdd(true); resetAddForm(); }}
          className="flex items-center gap-1.5 rounded-[var(--radius)] bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 transition-opacity">
          <Plus className="h-3.5 w-3.5" /> Add Lead
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-2)]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">Name</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">Contact</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">Stage</th>
              <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">Score</th>
              <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">Tags</th>
              <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">LTV</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">Last seen</th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-[var(--text-3)] text-sm">No leads yet.</p>
                  <button onClick={() => { setShowAdd(true); resetAddForm(); }}
                    className="mt-3 text-xs text-[var(--brand)] hover:underline">
                    Add your first lead →
                  </button>
                </td>
              </tr>
            )}
            {leads.map((lead) => {
              const ig    = getIgHandle(lead);
              const phone = getPhone(lead);
              return (
                <tr
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className="border-b border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg-2)] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text)] truncate max-w-[150px]">{lead.name ?? "Unnamed"}</p>
                    <p className="text-[10px] text-[var(--text-3)] md:hidden truncate max-w-[120px]">
                      {ig ?? phone ?? ""}
                    </p>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      {ig && (
                        <a href={`https://instagram.com/${ig.replace("@","")}`} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--brand)]">
                          <Instagram className="h-3 w-3 shrink-0" />{ig}
                        </a>
                      )}
                      {phone && (
                        <a href={`https://wa.me/${phone.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--brand)]">
                          <Phone className="h-3 w-3 shrink-0" />{phone}
                        </a>
                      )}
                      {!ig && !phone && (
                        <span className="text-xs text-[var(--text-3)]">{lead.channel}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[11px] font-semibold border rounded px-1.5 py-0.5 whitespace-nowrap", STAGE_COLORS[lead.stage] ?? STAGE_COLORS.cold)}>
                      {lead.stage.replace("_"," ")}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 font-mono text-sm">
                    <span className={scoreColor(lead.score)}>{lead.score}</span>
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(lead.tags ?? []).slice(0,3).map((t) => (
                        <span key={t} className="text-[10px] border border-[var(--brand)]/30 text-[var(--brand)] rounded px-1.5 py-0.5">{t}</span>
                      ))}
                      {(lead.tags ?? []).length > 3 && (
                        <span className="text-[10px] text-[var(--text-3)]">+{(lead.tags ?? []).length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 font-mono text-sm text-[var(--text-2)]">
                    {fmtInr(lead.ltv_inr)}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-xs text-[var(--text-3)] whitespace-nowrap">
                    {relativeTime(lead.last_seen_at)}
                  </td>
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === lead.id ? null : lead.id)}
                        className="p-1.5 rounded hover:bg-[var(--bg-3)] text-[var(--text-3)] transition-colors"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuOpenId === lead.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-1)] shadow-lg py-1">
                          <button onClick={() => { setMenuOpenId(null); setSelected(lead); }}
                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-2)] transition-colors">
                            View details
                          </button>
                          <button onClick={() => { setMenuOpenId(null); router.push(`/org/${orgSlug}/inbox`); }}
                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-2)] transition-colors">
                            Open inbox
                          </button>
                          <button onClick={() => { setMenuOpenId(null); deleteLead(lead); }}
                            className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-[var(--bg-2)] transition-colors">
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {loading && (
              <tr><td colSpan={8} className="px-4 py-6 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-[var(--text-3)]" />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {nextCursor && !loading && (
        <button onClick={() => fetchLeads(false)} className="text-xs text-[var(--brand)] hover:underline">
          Load more →
        </button>
      )}

      {/* Side panel */}
      {selected && (
        <LeadPanel
          lead={selected}
          orgId={orgId}
          orgSlug={orgSlug}
          onClose={() => setSelected(null)}
          onUpdate={(upd) => {
            setLeads((prev) => prev.map((l) => l.id === upd.id ? { ...l, ...upd } : l));
            setSelected((s) => s ? { ...s, ...upd } : s);
          }}
        />
      )}

      {/* Add lead sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" onClick={() => setShowAdd(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <form
            onSubmit={addLead}
            className="relative z-10 w-full max-w-sm bg-[var(--bg-1)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[var(--text)]">Add lead manually</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="text-[var(--text-3)] hover:text-[var(--text)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                  Full name <span className="text-[var(--brand)]">*</span>
                </label>
                <input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Priya Sharma" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                  Instagram handle{" "}
                  <span className="text-[var(--text-3)] font-normal">(required if no phone)</span>
                </label>
                <input value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="@username or username" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                  Phone number{" "}
                  <span className="text-[var(--text-3)] font-normal">(required if no IG)</span>
                </label>
                <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                  Email <span className="text-[var(--text-3)] font-normal">(optional)</span>
                </label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="priya@example.com" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Stage</label>
                  <select value={newStage} onChange={(e) => setNewStage(e.target.value)} className={inputCls}>
                    {STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_"," ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Source</label>
                  <select value={newSource} onChange={(e) => setNewSource(e.target.value)} className={inputCls}>
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                  Tags <span className="text-[var(--text-3)] font-normal">(comma separated)</span>
                </label>
                <input value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="fitness, female, 25-35" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                  Notes <span className="text-[var(--text-3)] font-normal">(optional)</span>
                </label>
                <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2}
                  placeholder="Referred by client X, interested in 1:1 coaching"
                  className={cn(inputCls, "resize-none")} />
              </div>
            </div>

            {addError && <p className="text-xs text-red-400">{addError}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 rounded-[var(--radius)] border border-[var(--border)] py-2.5 text-sm text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || !newName.trim()}
                className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] py-2.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Saving…" : "Add Lead"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ─── Lead side panel ────────────────────────────────────────────── */
type PanelTab = "overview" | "activity" | "notes" | "files";

function LeadPanel({ lead, orgId, orgSlug, onClose, onUpdate }: {
  lead:     LeadRow;
  orgId:    string;
  orgSlug:  string;
  onClose:  () => void;
  onUpdate: (upd: Partial<LeadRow> & { id: string }) => void;
}) {
  const router     = useRouter();
  const [tab,          setTab]          = React.useState<PanelTab>("overview");
  const [activity,     setActivity]     = React.useState<ActivityData | null>(null);
  const [actLoading,   setActLoading]   = React.useState(false);
  const [notes,        setNotes]        = React.useState(lead.notes ?? "");
  const [savingNotes,  setSavingNotes]  = React.useState(false);

  const ig    = getIgHandle(lead);
  const phone = getPhone(lead);

  React.useEffect(() => {
    if (tab !== "activity" || activity) return;
    setActLoading(true);
    fetch(`/api/orgs/${orgId}/leads/${lead.id}/activity`)
      .then((r) => r.json())
      .then((d) => setActivity(d))
      .catch(() => setActivity({ conversation_id: null, messages: [], bookings: [], payments: [] }))
      .finally(() => setActLoading(false));
  }, [tab, activity, orgId, lead.id]);

  async function saveNotes() {
    setSavingNotes(true);
    await fetch(`/api/orgs/${orgId}/leads/${lead.id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ notes }),
    }).catch(() => null);
    setSavingNotes(false);
    onUpdate({ id: lead.id, notes });
    toast({ title: "Notes saved" });
  }

  const tabItem = (t: PanelTab, icon: React.ReactNode, label: string) => (
    <button key={t} onClick={() => setTab(t)}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-colors whitespace-nowrap",
        tab === t ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--bg-2)]"
      )}>
      {icon}{label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative z-10 flex flex-col w-full max-w-md bg-[var(--bg-1)] border-l border-[var(--border)] h-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-[var(--border)] shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg font-semibold text-[var(--text)] truncate">{lead.name ?? "Unnamed"}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              {ig && (
                <a href={`https://instagram.com/${ig.replace("@","")}`} target="_blank" rel="noreferrer"
                  className="text-xs text-[var(--text-3)] hover:text-[var(--brand)] flex items-center gap-1">
                  <Instagram className="h-3 w-3" />{ig}
                </a>
              )}
              {phone && (
                <a href={`https://wa.me/${phone.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                  className="text-xs text-[var(--text-3)] hover:text-[var(--brand)] flex items-center gap-1">
                  <Phone className="h-3 w-3" />{phone}
                </a>
              )}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)] p-1 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border)] shrink-0 overflow-x-auto">
          {tabItem("overview", <ChevronRight className="h-3 w-3" />,   "Overview")}
          {tabItem("activity", <RefreshCw className="h-3 w-3" />,      "Activity")}
          {tabItem("notes",    <StickyNote className="h-3 w-3" />,     "Notes")}
          {tabItem("files",    <FileText className="h-3 w-3" />,       "Files")}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === "overview" && (
            <OverviewTab lead={lead} orgId={orgId} orgSlug={orgSlug} onUpdate={onUpdate} router={router} />
          )}
          {tab === "activity" && (
            <ActivityTab
              activity={activity}
              loading={actLoading}
              orgSlug={orgSlug}
              router={router}
            />
          )}
          {tab === "notes" && (
            <div className="space-y-3">
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
                rows={14}
                placeholder="Add notes about this lead… (auto-saves on blur)"
                className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--text-3)]">Auto-saves on blur</p>
                <button onClick={saveNotes} disabled={savingNotes}
                  className="text-xs text-[var(--brand)] hover:underline disabled:opacity-50">
                  {savingNotes ? "Saving…" : "Save now"}
                </button>
              </div>
            </div>
          )}
          {tab === "files" && (
            <div className="text-center py-8 space-y-2">
              <FileText className="h-8 w-8 mx-auto text-[var(--text-3)]" />
              <p className="text-sm font-medium text-[var(--text)]">File attachments</p>
              <p className="text-xs text-[var(--text-3)]">Coming soon — upload contracts, photos, and documents per lead.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Overview tab ────────────────────────────────────────────────── */
function OverviewTab({ lead, orgId, orgSlug, onUpdate, router }: {
  lead:     LeadRow;
  orgId:    string;
  orgSlug:  string;
  onUpdate: (upd: Partial<LeadRow> & { id: string }) => void;
  router:   ReturnType<typeof useRouter>;
}) {
  const [stage,  setStage]  = React.useState(lead.stage);
  const [saving, setSaving] = React.useState(false);

  async function updateStage(s: string) {
    setStage(s);
    setSaving(true);
    await fetch(`/api/orgs/${orgId}/leads/${lead.id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ stage: s }),
    }).catch(() => null);
    setSaving(false);
    onUpdate({ id: lead.id, stage: s });
    toast({ title: `Stage → ${s}` });
  }

  const ig    = getIgHandle(lead);
  const phone = getPhone(lead);

  return (
    <div className="space-y-5">
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] p-3 text-center">
          <p className={cn("font-mono text-xl font-bold", scoreColor(lead.score))}>{lead.score}</p>
          <p className="text-[10px] text-[var(--text-3)] mt-0.5">Score</p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] p-3 text-center">
          <p className="font-mono text-base font-bold text-[var(--brand)]">{fmtInr(lead.ltv_inr)}</p>
          <p className="text-[10px] text-[var(--text-3)] mt-0.5">LTV</p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] p-3 text-center">
          <p className="text-xs font-semibold text-[var(--text)] leading-tight">{relativeTime(lead.last_seen_at)}</p>
          <p className="text-[10px] text-[var(--text-3)] mt-0.5">Last seen</p>
        </div>
      </div>

      {/* Stage */}
      <div>
        <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-2">
          Stage {saving && <span className="text-[var(--text-3)] font-normal normal-case">(saving…)</span>}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button key={s} onClick={() => updateStage(s)}
              className={cn("text-[11px] font-semibold border rounded px-2 py-1 transition-all",
                s === stage
                  ? (STAGE_COLORS[s] ?? STAGE_COLORS.cold)
                  : "bg-[var(--bg-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--bg-3)]"
              )}>
              {s.replace("_"," ")}
            </button>
          ))}
        </div>
      </div>

      {/* Contact */}
      {(ig || phone || (lead.metadata?.email as string)) && (
        <div>
          <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-2">Contact</p>
          <div className="space-y-1.5">
            {ig && (
              <div className="flex items-center gap-2">
                <Instagram className="h-3.5 w-3.5 text-[var(--text-3)] shrink-0" />
                <a href={`https://instagram.com/${ig.replace("@","")}`} target="_blank" rel="noreferrer"
                  className="text-sm text-[var(--text-2)] hover:text-[var(--brand)]">{ig}</a>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-[var(--text-3)] shrink-0" />
                <a href={`https://wa.me/${phone.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                  className="text-sm text-[var(--text-2)] hover:text-[var(--brand)]">{phone}</a>
              </div>
            )}
            {(lead.metadata?.email as string) && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-3)] shrink-0">✉</span>
                <span className="text-sm text-[var(--text-2)]">{lead.metadata?.email as string}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      {(lead.tags ?? []).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {(lead.tags ?? []).map((t) => (
              <span key={t} className="text-xs border border-[var(--brand)]/30 text-[var(--brand)] rounded px-2 py-0.5">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={() => router.push(`/org/${orgSlug}/inbox`)}
          className="flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">
          <MessageSquare className="h-3.5 w-3.5" /> Open Inbox
        </button>
        {phone && (
          <a href={`https://wa.me/${phone.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">
            <Phone className="h-3.5 w-3.5" /> WhatsApp
          </a>
        )}
      </div>

      <p className="text-[11px] text-[var(--text-3)]">
        Added {relativeTime(lead.created_at)} · Source: {lead.source ?? "unknown"}
      </p>
    </div>
  );
}

/* ─── Activity tab ────────────────────────────────────────────────── */
function ActivityTab({ activity, loading, orgSlug, router }: {
  activity: ActivityData | null;
  loading:  boolean;
  orgSlug:  string;
  router:   ReturnType<typeof useRouter>;
}) {
  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-[var(--text-3)]" />
    </div>
  );
  if (!activity) return <p className="text-sm text-[var(--text-3)] py-4">Could not load activity.</p>;

  type Event =
    | { type: "message"; ts: string; data: MsgRow }
    | { type: "booking"; ts: string; data: BookingRow }
    | { type: "payment"; ts: string; data: PaymentRow };

  const events: Event[] = [
    ...activity.messages.map((m) => ({ type: "message" as const, ts: m.sent_at,    data: m })),
    ...activity.bookings.map((b) => ({ type: "booking" as const, ts: b.starts_at,  data: b })),
    ...activity.payments.map((p) => ({ type: "payment" as const, ts: p.created_at, data: p })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (events.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-sm text-[var(--text-3)]">No activity yet.</p>
        {activity.conversation_id && (
          <button onClick={() => router.push(`/org/${orgSlug}/inbox/${activity.conversation_id}`)}
            className="text-xs text-[var(--brand)] hover:underline">
            Start a conversation →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activity.conversation_id && (
        <button onClick={() => router.push(`/org/${orgSlug}/inbox/${activity.conversation_id}`)}
          className="w-full text-center text-xs text-[var(--brand)] hover:underline pb-3 border-b border-[var(--border)] mb-1">
          Open full conversation →
        </button>
      )}
      {events.map((ev, i) => (
        <div key={i} className="flex gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
          <div className="shrink-0 mt-0.5">
            {ev.type === "message" && <MessageSquare className="h-3.5 w-3.5 text-[var(--text-3)]" />}
            {ev.type === "booking" && <Calendar       className="h-3.5 w-3.5 text-blue-400" />}
            {ev.type === "payment" && <CreditCard      className="h-3.5 w-3.5 text-[var(--brand)]" />}
          </div>
          <div className="flex-1 min-w-0">
            {ev.type === "message" && (
              <>
                <p className="text-xs font-medium text-[var(--text-2)]">
                  {ev.data.direction === "inbound" ? "Lead" : ev.data.direction === "outbound" ? "AI Reply" : "System"}
                </p>
                <p className="text-xs text-[var(--text-3)] truncate">{ev.data.content}</p>
              </>
            )}
            {ev.type === "booking" && (
              <>
                <p className="text-xs font-medium text-[var(--text-2)]">Booking · {ev.data.status}</p>
                <p className="text-xs text-[var(--text-3)]">
                  {new Date(ev.data.starts_at).toLocaleString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}
                </p>
              </>
            )}
            {ev.type === "payment" && (
              <>
                <p className="text-xs font-medium text-[var(--text-2)]">
                  {fmtInr(ev.data.amount_inr)} · {ev.data.status}
                </p>
                {(ev.data.link_url ?? ev.data.payment_link_url) && (
                  <a href={(ev.data.link_url ?? ev.data.payment_link_url) ?? ""} target="_blank" rel="noreferrer"
                    className="text-xs text-[var(--brand)] hover:underline">View link →</a>
                )}
              </>
            )}
          </div>
          <p className="shrink-0 text-[10px] text-[var(--text-3)] whitespace-nowrap">{relativeTime(ev.ts)}</p>
        </div>
      ))}
    </div>
  );
}
