"use client";

import * as React from "react";
import {
  Send, Users, ChevronDown, Check, Loader2, Archive, Trash2,
  Clock, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

interface Template {
  id:        string;
  name:      string;
  body:      string;
  variables: string[];
}

interface Lead {
  id:      string;
  name:    string | null;
  phone:   string | null;
  channel: string;
  stage:   string;
  tags?:   string[];
}

interface BroadcastRecord {
  id:               string;
  name:             string | null;
  channel:          string;
  status:           string;
  send_at:          string;
  started_at:       string | null;
  completed_at:     string | null;
  total_recipients: number;
  sent_count:       number;
  failed_count:     number;
  archived_at:      string | null;
  created_at:       string;
}

interface Props {
  orgId:     string;
  orgSlug:   string;
  templates: Template[];
  leads:     Lead[];
  allTags:   string[];
}

type Tab = "send" | "history";
type Channel = "whatsapp" | "instagram" | "both";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  queued:    { label: "Queued",    color: "text-amber-400",          icon: Clock },
  sending:   { label: "Sending",   color: "text-blue-400",           icon: Loader2 },
  running:   { label: "Running",   color: "text-blue-400",           icon: Loader2 },
  completed: { label: "Completed", color: "text-[var(--brand)]",    icon: CheckCircle2 },
  partial:   { label: "Partial",   color: "text-amber-400",          icon: AlertTriangle },
  failed:    { label: "Failed",    color: "text-red-400",            icon: XCircle },
  cancelled: { label: "Cancelled", color: "text-[var(--text-3)]",   icon: XCircle },
};

function fmtDt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
    });
  } catch { return iso; }
}

function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-sm font-semibold text-[var(--text)]">{title}</p>
        <p className="text-xs text-[var(--text-3)] leading-relaxed whitespace-pre-line">{body}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="rounded-[var(--radius-sm)] bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BroadcastHistoryCard({ broadcast, orgId, onRefresh }: {
  broadcast: BroadcastRecord; orgId: string; onRefresh: () => void;
}) {
  const [acting, setActing] = React.useState<"archive" | "delete" | null>(null);
  const [hardConfirm, setHardConfirm] = React.useState(false);
  const cfg = STATUS_CONFIG[broadcast.status] ?? STATUS_CONFIG.queued;
  const Icon = cfg.icon;
  const isTerminal = ["completed", "partial", "failed", "cancelled"].includes(broadcast.status);

  async function archive() {
    setActing("archive");
    try {
      const res = await fetch(`/api/orgs/${orgId}/broadcasts/${broadcast.id}?mode=archive`, { method: "DELETE" });
      if (res.ok) { toast({ title: "Broadcast archived", variant: "success" }); onRefresh(); }
      else toast({ title: "Failed to archive", variant: "destructive" });
    } finally { setActing(null); }
  }

  async function hardDelete() {
    setActing("delete");
    setHardConfirm(false);
    try {
      const res = await fetch(`/api/orgs/${orgId}/broadcasts/${broadcast.id}?mode=hard`, { method: "DELETE" });
      if (res.ok) { toast({ title: "Broadcast deleted", variant: "success" }); onRefresh(); }
      else toast({ title: "Failed to delete", variant: "destructive" });
    } finally { setActing(null); }
  }

  return (
    <>
      {hardConfirm && (
        <ConfirmModal
          title="Delete broadcast permanently?"
          body={"This will permanently remove this broadcast and all delivery records.\n\nThis cannot be undone."}
          confirmLabel="Delete permanently"
          onConfirm={hardDelete}
          onCancel={() => setHardConfirm(false)}
        />
      )}
      <div className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--bg-2)] p-4 space-y-3",
        broadcast.status === "completed" ? "border-[var(--brand)]/20" :
        broadcast.status === "failed"    ? "border-red-500/20" :
        broadcast.status === "partial"   ? "border-amber-500/20" : "border-[var(--border)]"
      )}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[var(--text)]">
                {broadcast.name ?? `Broadcast · ${broadcast.channel}`}
              </span>
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium", cfg.color)}>
                <Icon className="h-3 w-3" />
                {cfg.label}
              </span>
            </div>
            <p className="text-xs text-[var(--text-3)]">
              {fmtDt(broadcast.send_at)} · {broadcast.channel}
            </p>
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <p className="text-xs text-[var(--text)]">
              <span className="text-[var(--brand)] font-medium">{broadcast.sent_count}</span>
              <span className="text-[var(--text-3)]"> / {broadcast.total_recipients}</span>
            </p>
            {broadcast.failed_count > 0 && (
              <p className="text-[11px] text-red-400">{broadcast.failed_count} failed</p>
            )}
          </div>
        </div>

        {isTerminal && (
          <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
            <button
              onClick={archive}
              disabled={!!acting}
              className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors disabled:opacity-50"
            >
              {acting === "archive" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
              {acting === "archive" ? "Archiving…" : "Archive"}
            </button>
            <button
              onClick={() => setHardConfirm(true)}
              disabled={!!acting}
              className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {acting === "delete" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {acting === "delete" ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function BroadcastClient({ orgId, templates, leads, allTags }: Props) {
  const [tab,              setTab]              = React.useState<Tab>("send");
  const [selectedTemplate, setSelectedTemplate] = React.useState<Template | null>(templates[0] ?? null);
  const [channel,          setChannel]          = React.useState<Channel>("whatsapp");
  const [stageFilter,      setStageFilter]      = React.useState<string>("");
  const [tagFilter,        setTagFilter]         = React.useState<string>("");
  const [varValues,        setVarValues]         = React.useState<string[]>([]);
  const [scheduleEnabled,  setScheduleEnabled]  = React.useState(false);
  const [scheduleAt,       setScheduleAt]       = React.useState<string>("");
  const [broadcastName,    setBroadcastName]    = React.useState<string>("");
  const [sending,          setSending]          = React.useState(false);
  const [result,           setResult]           = React.useState<{ sent: number; failed: number; scheduled: boolean } | null>(null);

  // History state
  const [history,       setHistory]       = React.useState<BroadcastRecord[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  React.useEffect(() => {
    if (selectedTemplate) {
      setVarValues(new Array(selectedTemplate.variables.length).fill(""));
    }
  }, [selectedTemplate]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/broadcasts`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.broadcasts ?? []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  React.useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab]); // eslint-disable-line

  function leadsForChannel(): Lead[] {
    return leads.filter((l) => {
      const lc = l.channel?.toLowerCase();
      if (channel === "whatsapp") return (lc === "whatsapp" || lc === "whatsapp_cloud") && !!l.phone;
      if (channel === "instagram") return lc === "instagram";
      if (channel === "both") return (lc === "whatsapp" || lc === "whatsapp_cloud") ? !!l.phone : lc === "instagram";
      return false;
    });
  }

  const filteredLeads = leadsForChannel().filter((l) => {
    if (stageFilter && l.stage !== stageFilter) return false;
    if (tagFilter   && !(l.tags ?? []).includes(tagFilter)) return false;
    return true;
  });

  function renderPreview(body: string, vars: string[]): string {
    let t = body;
    vars.forEach((v, i) => { t = t.replace(`{{${i + 1}}}`, v || `{{${i + 1}}}`); });
    return t;
  }

  async function handleSend() {
    if (filteredLeads.length === 0 || sending) return;
    const label = scheduleEnabled && scheduleAt
      ? `Schedule broadcast to ${filteredLeads.length} lead(s)?`
      : `Send to ${filteredLeads.length} lead(s)? This cannot be undone.`;
    if (!confirm(label)) return;
    setSending(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = {
        lead_ids:        filteredLeads.map((l) => l.id),
        channel,
        name:            broadcastName || undefined,
        template_params: varValues,
      };
      if (selectedTemplate) payload.template_id = selectedTemplate.id;
      if (scheduleEnabled && scheduleAt) {
        // Convert local datetime-local value to ISO with timezone
        payload.send_at = new Date(scheduleAt).toISOString();
      }
      const res = await fetch(`/api/orgs/${orgId}/broadcast`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ sent: data.sent, failed: data.failed ?? 0, scheduled: data.scheduled });
        toast({ title: data.scheduled ? "Broadcast scheduled" : "Broadcast queued", variant: "success" });
      } else {
        toast({ title: "Broadcast failed", description: data.error ?? "Unknown error", variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  }

  const STAGES = ["cold", "warm", "hot", "booked", "qualified", "won", "paid"];

  const channelLabels: Record<Channel, string> = {
    whatsapp:  "WhatsApp",
    instagram: "Instagram",
    both:      "Both (WA + IG)",
  };

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-[var(--radius)] bg-[var(--bg-3)] p-1 w-fit">
        {(["send", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-[var(--radius-sm)] px-4 py-1.5 text-xs font-medium transition-colors",
              tab === t
                ? "bg-[var(--bg-1)] text-[var(--text)] shadow-sm"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            )}
          >
            {t === "send" ? "Compose" : "History"}
          </button>
        ))}
      </div>

      {/* ── COMPOSE TAB ── */}
      {tab === "send" && (
        <div className="space-y-5">
          {/* Broadcast name */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--text-2)]">Broadcast name <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
            <input
              value={broadcastName}
              onChange={(e) => setBroadcastName(e.target.value)}
              placeholder="e.g. June Promo Blast"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />
          </div>

          {/* Channel selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--text-2)]">Channel</label>
            <div className="flex gap-2">
              {(["whatsapp", "instagram", "both"] as Channel[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={cn(
                    "flex-1 rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-medium transition-colors",
                    channel === c
                      ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                      : "border-[var(--border)] bg-[var(--bg-3)] text-[var(--text-2)] hover:border-[var(--text-3)]"
                  )}
                >
                  {channelLabels[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Template selector — only for WhatsApp / both */}
          {channel !== "instagram" && templates.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-2)]">Template</label>
              <div className="grid grid-cols-1 gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className={cn(
                      "flex items-center justify-between rounded-[var(--radius)] border px-3 py-2.5 text-left text-xs transition-colors",
                      selectedTemplate?.id === t.id
                        ? "border-[var(--brand)]/40 bg-[var(--brand)]/8 text-[var(--text)]"
                        : "border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-2)] hover:bg-[var(--bg-3)]"
                    )}
                  >
                    <span className="font-medium">{t.name}</span>
                    {selectedTemplate?.id === t.id && <Check className="h-3.5 w-3.5 text-[var(--brand)]" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Variable inputs */}
          {selectedTemplate && selectedTemplate.variables.length > 0 && channel !== "instagram" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-2)]">Template variables</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedTemplate.variables.map((varName, i) => (
                  <div key={i} className="space-y-1">
                    <label className="text-[10px] text-[var(--text-3)]">{`{{${i + 1}}}`} — {varName}</label>
                    <input
                      value={varValues[i] ?? ""}
                      onChange={(e) => setVarValues((v) => { const n = [...v]; n[i] = e.target.value; return n; })}
                      placeholder={varName}
                      className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {selectedTemplate && channel !== "instagram" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Preview</label>
              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-4 py-3 text-xs text-[var(--text-2)] leading-relaxed whitespace-pre-wrap">
                {renderPreview(selectedTemplate.body, varValues)}
              </div>
            </div>
          )}

          {/* Recipient filters */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--text-2)]">Filter recipients</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="w-full appearance-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 pr-7 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                >
                  <option value="">All stages</option>
                  {STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-3)]" />
              </div>
              <div className="relative">
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="w-full appearance-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 pr-7 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                >
                  <option value="">All tags</option>
                  {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-3)]" />
              </div>
            </div>
            <p className="text-xs text-[var(--text-3)]">
              <Users className="h-3 w-3 inline mr-1" />
              {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""} matched
              {channel === "both" && " (WhatsApp by phone, Instagram by IG channel)"}
            </p>
          </div>

          {/* Recipient preview */}
          {filteredLeads.length > 0 && (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] divide-y divide-[var(--border)] max-h-40 overflow-y-auto">
              {filteredLeads.slice(0, 20).map((l) => (
                <div key={l.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-[var(--text-2)]">{l.name ?? "Unknown"}</span>
                  <span className="text-[10px] text-[var(--text-3)]">{l.phone ?? l.channel}</span>
                </div>
              ))}
              {filteredLeads.length > 20 && (
                <div className="px-3 py-2 text-[10px] text-[var(--text-3)]">+{filteredLeads.length - 20} more</div>
              )}
            </div>
          )}

          {/* Schedule for later */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-medium text-[var(--text-2)]">Schedule for later</span>
            </label>
            {scheduleEnabled && (
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
              />
            )}
          </div>

          {/* Result */}
          {result && (
            <div className="rounded-[var(--radius)] border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-4 py-3 text-xs text-[var(--text-2)]">
              {result.scheduled
                ? `Scheduled: ${result.sent} recipient${result.sent !== 1 ? "s" : ""}`
                : `Queued: ${result.sent} sent · ${result.failed} failed`}
            </div>
          )}

          {/* Send button */}
          <Button
            variant="primary"
            className="w-full"
            disabled={filteredLeads.length === 0 || sending || (scheduleEnabled && !scheduleAt)}
            onClick={handleSend}
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</>
              : scheduleEnabled
              ? <><Clock className="h-4 w-4 mr-2" /> Schedule for {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}</>
              : <><Send className="h-4 w-4 mr-2" /> Send to {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}</>
            }
          </Button>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === "history" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-3)]">{history.length} broadcast{history.length !== 1 ? "s" : ""}</p>
            <button
              onClick={loadHistory}
              disabled={historyLoading}
              className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", historyLoading && "animate-spin")} />
              Refresh
            </button>
          </div>
          {historyLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] animate-pulse" />
              ))}
            </div>
          )}
          {!historyLoading && history.length === 0 && (
            <div className="text-center py-10 text-sm text-[var(--text-3)]">No broadcasts yet.</div>
          )}
          {!historyLoading && history.map((b) => (
            <BroadcastHistoryCard key={b.id} broadcast={b} orgId={orgId} onRefresh={loadHistory} />
          ))}
        </div>
      )}
    </div>
  );
}
