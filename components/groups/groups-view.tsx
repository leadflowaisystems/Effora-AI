"use client";

import * as React from "react";
import { Plus, Search, Users, Instagram, Phone, MessageSquare, Loader2, X, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getPlanLimits, usagePct, isAtLimit } from "@/lib/plan";

interface Group {
  id:           string;
  name:         string;
  tag:          string;
  channel:      "instagram" | "whatsapp" | "both";
  description?: string | null;
  member_count: number;
  created_at:   string;
}

interface Props {
  orgId:         string;
  orgSlug:       string;
  initialGroups: Group[];
  plan:          string;
}

const CHANNEL_BADGE: Record<string, React.ReactNode> = {
  instagram: <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20"><Instagram className="h-2.5 w-2.5" /> Instagram</span>,
  whatsapp:  <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] border border-[var(--brand)]/20"><Phone className="h-2.5 w-2.5" /> WhatsApp</span>,
  both:      <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20"><MessageSquare className="h-2.5 w-2.5" /> Both</span>,
};

export function GroupsView({ orgId, orgSlug, initialGroups, plan }: Props) {
  const router = useRouter();
  const [groups,   setGroups]   = React.useState<Group[]>(initialGroups);
  const [search,   setSearch]   = React.useState("");
  const [showNew,  setShowNew]  = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createErr, setCreateErr] = React.useState<string | null>(null);

  // New group form
  const [newName,    setNewName]    = React.useState("");
  const [newChannel, setNewChannel] = React.useState<"instagram" | "whatsapp" | "both">("whatsapp");
  const [newDesc,    setNewDesc]    = React.useState("");

  const limits    = getPlanLimits(plan);
  const groupsPct = usagePct(groups.length, limits.groupsAllowed);
  const atLimit   = isAtLimit(groups.length, limits.groupsAllowed);

  const filtered = search.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()) || g.tag.toLowerCase().includes(search.toLowerCase()))
    : groups;

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, channel: newChannel, description: newDesc || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateErr(data.error ?? "Failed to create group"); return; }
      router.push(`/org/${orgSlug}/groups/${data.group.id}`);
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  const inputCls = "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

  return (
    <div className="space-y-4">
      {/* Usage bar */}
      {groupsPct !== null && groupsPct >= 60 && (
        <div className={cn(
          "flex items-center justify-between rounded-[var(--radius)] border px-3 py-2 text-xs",
          groupsPct >= 100 ? "border-red-500/30 bg-red-500/5 text-red-400" : "border-amber-500/30 bg-amber-500/5 text-amber-400"
        )}>
          <span>{groups.length}/{limits.groupsAllowed} groups used{groupsPct >= 80 ? " — approaching limit" : ""}</span>
          {groupsPct >= 80 && <Link href={`/org/${orgSlug}/settings/billing`} className="font-medium underline">Upgrade</Link>}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-3)]" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] pl-8 pr-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
        </div>
        <Button
          variant="primary" size="sm"
          disabled={atLimit}
          onClick={() => setShowNew(true)}
          className="gap-1.5 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> New Group
        </Button>
      </div>

      {/* Create Group Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-1)] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-[var(--text)]">Create Group</h2>
              <button onClick={() => setShowNew(false)} className="text-[var(--text-3)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={createGroup} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Group name <span className="text-[var(--brand)]">*</span></label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tuesday Yoga Class" className={inputCls} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Channel <span className="text-[var(--brand)]">*</span></label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["instagram","whatsapp","both"] as const).map((ch) => (
                    <button key={ch} type="button" onClick={() => setNewChannel(ch)}
                      className={cn(
                        "rounded-[var(--radius-sm)] border py-2 text-xs font-medium transition-colors",
                        newChannel === ch
                          ? "border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]"
                          : "border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-3)] hover:text-[var(--text-2)]"
                      )}>
                      {ch.charAt(0).toUpperCase() + ch.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Description <span className="text-[var(--text-3)] font-normal">(optional)</span></label>
                <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="e.g. Morning yoga batch, Tuesdays 7am" className={inputCls} />
              </div>
              {createErr && <p className="text-xs text-red-400">{createErr}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 rounded-[var(--radius)] border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors">Cancel</button>
                <button type="submit" disabled={creating || !newName.trim()}
                  className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] py-2 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {creating ? "Creating…" : "Create Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Groups list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--bg-3)] border border-[var(--border)]">
            <Users className="h-7 w-7 text-[var(--text-3)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">{search ? "No groups match" : "No groups yet"}</p>
            <p className="text-xs text-[var(--text-3)] mt-1">
              {search ? "Try a different search" : "Create a group to send bulk messages to segments of leads."}
            </p>
          </div>
          {!search && !atLimit && (
            <Button variant="primary" size="sm" onClick={() => setShowNew(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Create first group
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map((g) => (
            <Link
              key={g.id}
              href={`/org/${orgSlug}/groups/${g.id}`}
              className="group flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] px-4 py-3 hover:bg-[var(--bg-2)] hover:border-[var(--brand)]/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-3)]">
                  <Users className="h-4 w-4 text-[var(--text-3)]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[var(--text)]">{g.name}</span>
                    {CHANNEL_BADGE[g.channel]}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[var(--text-3)] font-mono">#{g.tag}</span>
                    <span className="text-[10px] text-[var(--text-3)]">{g.member_count} member{g.member_count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--text-3)] group-hover:text-[var(--brand)] transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
