"use client";

import * as React from "react";
import { Plus, Trash2, CheckCircle2, Clock, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Template {
  id:              string;
  name:            string;
  category:        string;
  body:            string;
  variables:       string[];
  approval_status: string;
  created_at:      string;
}

interface Props {
  orgId:            string;
  orgSlug:          string;
  initialTemplates: Template[];
}

const STARTER_TEMPLATES = [
  {
    name:      "Class Reminder",
    category:  "UTILITY",
    body:      "Hi {{1}}, reminder that {{2}} starts at {{3}}. See you there! 🙏",
    variables: ["Customer name", "Class name", "Time"],
  },
  {
    name:      "Booking Confirmation",
    category:  "UTILITY",
    body:      "Hi {{1}}, your session on {{2}} at {{3}} is confirmed. Here's your link: {{4}}",
    variables: ["Customer name", "Date", "Time", "Meeting link"],
  },
  {
    name:      "Payment Reminder",
    category:  "UTILITY",
    body:      "Hi {{1}}, just a friendly reminder that your payment of ₹{{2}} is pending. Pay here: {{3}}",
    variables: ["Customer name", "Amount", "Payment link"],
  },
];

const STATUS_ICONS = {
  draft:     <Clock     className="h-3.5 w-3.5 text-[var(--text-3)]" />,
  submitted: <Loader2   className="h-3.5 w-3.5 text-amber-400 animate-spin" />,
  approved:  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand)]" />,
  rejected:  <XCircle   className="h-3.5 w-3.5 text-red-400" />,
};

const STATUS_LABELS = {
  draft:     "Draft",
  submitted: "Pending approval",
  approved:  "Approved",
  rejected:  "Rejected",
};

export function TemplatesClient({ orgId, initialTemplates }: Props) {
  const [templates, setTemplates] = React.useState<Template[]>(initialTemplates);
  const [adding,    setAdding]    = React.useState(false);
  const [saving,    setSaving]    = React.useState(false);

  const [newName,     setNewName]     = React.useState("");
  const [newCategory, setNewCategory] = React.useState("UTILITY");
  const [newBody,     setNewBody]     = React.useState("");
  const [newVarCount, setNewVarCount] = React.useState(0);
  const [newVarNames, setNewVarNames] = React.useState<string[]>([]);

  // Auto-detect variable count from body
  React.useEffect(() => {
    const matches = Array.from(newBody.matchAll(/\{\{(\d+)\}\}/g));
    const max = matches.reduce((m, match) => Math.max(m, Number(match[1])), 0);
    setNewVarCount(max);
    setNewVarNames((prev) => {
      const arr = [...prev];
      while (arr.length < max) arr.push("");
      return arr.slice(0, max);
    });
  }, [newBody]);

  async function saveTemplate() {
    if (!newName.trim() || !newBody.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/whatsapp-templates`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: newName, category: newCategory, body: newBody, variables: newVarNames }),
      });
      const data = await res.json();
      if (res.ok && data.template) {
        setTemplates((t) => [data.template, ...t]);
        setAdding(false);
        setNewName(""); setNewBody(""); setNewVarNames([]);
      } else {
        alert(data.error ?? "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/orgs/${orgId}/whatsapp-templates/${id}`, { method: "DELETE" });
    setTemplates((t) => t.filter((x) => x.id !== id));
  }

  function applyStarter(tpl: typeof STARTER_TEMPLATES[0]) {
    setNewName(tpl.name);
    setNewCategory(tpl.category);
    setNewBody(tpl.body);
    setNewVarNames(tpl.variables);
    setAdding(true);
  }

  return (
    <div className="space-y-5">
      {/* Starter templates */}
      {templates.length === 0 && !adding && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-3)] font-medium">Start with a preset:</p>
          <div className="grid gap-2">
            {STARTER_TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => applyStarter(t)}
                className="flex items-start justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-3 text-left hover:bg-[var(--bg-3)] transition-colors group"
              >
                <div>
                  <p className="text-xs font-medium text-[var(--text)]">{t.name}</p>
                  <p className="text-[11px] text-[var(--text-3)] mt-0.5 leading-relaxed">{t.body}</p>
                </div>
                <span className="text-[10px] text-[var(--brand)] shrink-0 ml-3 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Use →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add new form */}
      {adding ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--text)]">New template</p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-3)]">Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Class Reminder"
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-3)]">Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]">
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--text-3)]">Body — use {`{{1}}`}, {`{{2}}`} for variables</label>
            <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={3}
              placeholder={"Hi {{1}}, your session on {{2}} is confirmed."}
              className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2.5 py-2 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]" />
          </div>

          {newVarCount > 0 && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-3)]">Variable labels (for your reference)</label>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: newVarCount }, (_, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text-3)] shrink-0">{`{{${i + 1}}}`}</span>
                    <input value={newVarNames[i] ?? ""} onChange={(e) => setNewVarNames((v) => { const n = [...v]; n[i] = e.target.value; return n; })}
                      placeholder={`Variable ${i + 1}`}
                      className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-amber-500/5 border border-amber-500/20 px-2.5 py-2">
            <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
            <p className="text-[10px] text-amber-400/80">Templates must be submitted to Meta for approval before use. Approval takes 24–72 hours.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={saveTemplate} disabled={saving || !newName.trim() || !newBody.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save as draft"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New template
        </Button>
      )}

      {/* Existing templates */}
      {templates.length > 0 && (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-medium text-[var(--text)]">{t.name}</p>
                  <span className={cn(
                    "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border",
                    t.approval_status === "approved"
                      ? "border-[var(--brand)]/30 bg-[var(--brand)]/8 text-[var(--brand)]"
                      : t.approval_status === "rejected"
                      ? "border-red-500/30 bg-red-500/8 text-red-400"
                      : "border-[var(--border)] bg-[var(--bg-3)] text-[var(--text-3)]"
                  )}>
                    {STATUS_ICONS[t.approval_status as keyof typeof STATUS_ICONS]}
                    {STATUS_LABELS[t.approval_status as keyof typeof STATUS_LABELS] ?? t.approval_status}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-3)] leading-relaxed">{t.body}</p>
              </div>
              <button onClick={() => deleteTemplate(t.id)} className="shrink-0 text-[var(--text-3)] hover:text-red-400 transition-colors mt-0.5">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
