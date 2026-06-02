"use client";

import * as React from "react";
import { Send, Users, ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Template {
  id:        string;
  name:      string;
  body:      string;
  variables: string[];
}

interface Lead {
  id:    string;
  name:  string | null;
  phone: string | null;
  stage: string;
  tags?: string[];
}

interface Props {
  orgId:     string;
  orgSlug:   string;
  templates: Template[];
  leads:     Lead[];
  allTags:   string[];
}

export function BroadcastClient({ orgId, templates, leads, allTags }: Props) {
  const [selectedTemplate, setSelectedTemplate] = React.useState<Template | null>(templates[0] ?? null);
  const [stageFilter,      setStageFilter]      = React.useState<string>("");
  const [tagFilter,        setTagFilter]         = React.useState<string>("");
  const [varValues,        setVarValues]         = React.useState<string[]>([]);
  const [sending,          setSending]           = React.useState(false);
  const [result,           setResult]            = React.useState<{ sent: number; failed: number } | null>(null);

  // Update var slots when template changes
  React.useEffect(() => {
    if (selectedTemplate) {
      setVarValues(new Array(selectedTemplate.variables.length).fill(""));
    }
  }, [selectedTemplate]);

  const filteredLeads = leads.filter((l) => {
    if (stageFilter && l.stage !== stageFilter) return false;
    if (tagFilter   && !(l.tags ?? []).includes(tagFilter)) return false;
    return !!l.phone;
  });

  function renderPreview(body: string, vars: string[]): string {
    let t = body;
    vars.forEach((v, i) => { t = t.replace(`{{${i + 1}}}`, v || `{{${i + 1}}}`); });
    return t;
  }

  async function handleSend() {
    if (!selectedTemplate || filteredLeads.length === 0 || sending) return;
    if (!confirm(`Send to ${filteredLeads.length} lead(s)? This cannot be undone.`)) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/broadcast`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          template_id:     selectedTemplate.id,
          template_params: varValues,
          lead_ids:        filteredLeads.map((l) => l.id),
        }),
      });
      const data = await res.json();
      if (res.ok) setResult(data);
      else alert(data.error ?? "Broadcast failed");
    } finally {
      setSending(false);
    }
  }

  const STAGES = ["cold", "warm", "hot", "booked", "qualified", "won", "paid"];

  return (
    <div className="space-y-5">
      {/* Template selector */}
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

      {/* Variable inputs */}
      {selectedTemplate && selectedTemplate.variables.length > 0 && (
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
      {selectedTemplate && (
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
          {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""} selected (with phone numbers)
        </p>
      </div>

      {/* Recipient preview list */}
      {filteredLeads.length > 0 && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] divide-y divide-[var(--border)] max-h-40 overflow-y-auto">
          {filteredLeads.slice(0, 20).map((l) => (
            <div key={l.id} className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-[var(--text-2)]">{l.name ?? "Unknown"}</span>
              <span className="text-[10px] text-[var(--text-3)]">{l.phone}</span>
            </div>
          ))}
          {filteredLeads.length > 20 && (
            <div className="px-3 py-2 text-[10px] text-[var(--text-3)]">+{filteredLeads.length - 20} more</div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-[var(--radius)] border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-4 py-3 text-xs text-[var(--text-2)]">
          Queued: {result.sent} sent · {result.failed} failed
        </div>
      )}

      {/* Send button */}
      <Button
        variant="primary"
        className="w-full"
        disabled={!selectedTemplate || filteredLeads.length === 0 || sending}
        onClick={handleSend}
      >
        {sending
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...</>
          : <><Send className="h-4 w-4 mr-2" /> Send to {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}</>
        }
      </Button>
    </div>
  );
}
