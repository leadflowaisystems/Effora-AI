"use client";

import * as React from "react";
import { Copy, Check, Loader2, Zap, User } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  orgId:     string;
  orgSlug:   string;
  calLink:   string | null;
  funnelUrl: string;
}

interface Reply {
  angle:   "warm" | "direct" | "educational";
  text:    string;
  embedsCalUrl: boolean;
}

const ANGLE_LABELS = {
  warm:        "Warm & Curious",
  direct:      "Direct & Confident",
  educational: "Educational",
} as const;

const ANGLE_COLORS = {
  warm:        "border-amber-500/30 bg-amber-500/5",
  direct:      "border-[var(--brand)]/30 bg-[var(--brand)]/5",
  educational: "border-violet-500/30 bg-violet-500/5",
} as const;

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-[var(--brand)]" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function ReplyAssistant({ orgId, orgSlug, calLink, funnelUrl }: Props) {
  const [firstName, setFirstName] = React.useState("");
  const [handle,    setHandle]    = React.useState("");
  const [message,   setMessage]   = React.useState("");
  const [context,   setContext]   = React.useState("");
  const [loading,   setLoading]   = React.useState(false);
  const [replies,   setReplies]   = React.useState<Reply[]>([]);
  const [score,     setScore]     = React.useState<number | null>(null);
  const [label,     setLabel]     = React.useState<string | null>(null);
  const [savedLead, setSavedLead] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !message.trim()) return;
    setLoading(true);
    setReplies([]);
    try {
      const res = await fetch(`/api/orgs/${orgId}/assistant/draft-three`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ firstName, handle, message, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setReplies(data.replies ?? []);
      setScore(data.score  ?? null);
      setLabel(data.label  ?? null);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function saveLead() {
    try {
      await fetch(`/api/orgs/${orgId}/leads`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:        firstName,
          handle:      handle || firstName,
          channel:     "paste_assistant",
          stage:       label === "hot" ? "hot" : label === "warm" ? "warm" : "cold",
          score:       score ?? 0,
          firstMessage: message,
          context,
        }),
      });
      setSavedLead(true);
      toast({ title: "Lead saved", description: `${firstName} added to CRM`, variant: "success" });
    } catch {
      toast({ title: "Error saving lead", variant: "destructive" });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Input form */}
      <form onSubmit={handleSubmit} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--text-2)]">
              Lead&apos;s first name <span className="text-[var(--brand)]">*</span>
            </label>
            <input
              value={firstName} onChange={(e) => setFirstName(e.target.value)}
              placeholder="Priya" required
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--text-2)]">
              Instagram handle <span className="text-[var(--text-3)] text-[11px]">(optional)</span>
            </label>
            <input
              value={handle} onChange={(e) => setHandle(e.target.value)}
              placeholder="@priya.fitness"
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--text-2)]">
            Their message <span className="text-[var(--brand)]">*</span>
          </label>
          <textarea
            value={message} onChange={(e) => setMessage(e.target.value)}
            rows={4} required placeholder="Paste the DM here…"
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] resize-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--text-2)]">
            Context about this lead <span className="text-[var(--text-3)] text-[11px]">(optional)</span>
          </label>
          <input
            value={context} onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. long-time follower, bought my last course…"
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
        </div>
        <button
          type="submit" disabled={loading || !firstName.trim() || !message.trim()}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {loading ? "Generating…" : "Generate 3 replies"}
        </button>
      </form>

      {/* Results */}
      {replies.length > 0 && (
        <div className="space-y-4">
          {score !== null && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-3)]">
              <span>Lead score:</span>
              <span className={cn(
                "font-semibold",
                score >= 75 ? "text-red-400" : score >= 50 ? "text-amber-400" : "text-[var(--text-3)]"
              )}>{score}/100 · {label}</span>
            </div>
          )}

          {replies.map((r) => (
            <div key={r.angle} className={cn("rounded-[var(--radius-lg)] border p-4 space-y-3", ANGLE_COLORS[r.angle])}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                  {ANGLE_LABELS[r.angle]}
                </span>
                {r.embedsCalUrl && (
                  <span className="text-[10px] text-[var(--brand)] border border-[var(--brand)]/30 rounded px-1.5 py-0.5">
                    Cal link included
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">{r.text}</p>
              <CopyBtn text={r.text} />
            </div>
          ))}

          {!savedLead && (
            <button
              onClick={saveLead}
              className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors"
            >
              <User className="h-4 w-4" />
              Save {firstName} to CRM
            </button>
          )}
        </div>
      )}
    </div>
  );
}
