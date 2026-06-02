"use client";

import * as React from "react";
import { Sparkles, X, Send, Loader2, ChevronRight, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role:       "user" | "assistant";
  content:    string;
  tools_used?: string[];
}

interface Props {
  orgId:   string;
  orgSlug: string;
}

const QUICK_ACTIONS = [
  { label: "How am I doing this month?",    icon: "📈" },
  { label: "Who should I follow up today?", icon: "👤" },
  { label: "Today's schedule",              icon: "📅" },
  { label: "Show my top leads",             icon: "🔥" },
  { label: "Pipeline overview",             icon: "🎯" },
];

const TOOL_LABELS: Record<string, string> = {
  get_revenue_comparison:  "Comparing revenue",
  get_pipeline_overview:   "Checking pipeline",
  get_todays_schedule:     "Fetching today's schedule",
  get_top_leads:           "Finding top leads",
  get_lead_details:        "Loading lead details",
  search_leads:            "Searching leads",
  get_bookings:            "Checking bookings",
  get_payments:            "Checking payments",
  get_revenue_summary:     "Calculating revenue",
  get_activity_summary:    "Reviewing activity",
  analyze_lead:            "Analyzing lead",
  draft_message:           "Drafting message",
  search_conversations:    "Searching conversations",
  get_voice_profile:       "Loading voice profile",
};

/** Very simple inline markdown renderer for Ace responses. */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Bullet list item
    if (/^(\s*[-*•]\s+|\d+\.\s+)/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(\s*[-*•]\s+|\d+\.\s+)/.test(lines[i])) {
        items.push(lines[i].replace(/^(\s*[-*•]\s+|\d+\.\s+)/, ""));
        i++;
      }
      nodes.push(
        <ul key={i} className="space-y-1 my-1.5 pl-2">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 text-xs leading-relaxed">
              <span className="text-[var(--brand)] shrink-0 mt-0.5">•</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line → spacing
    if (line.trim() === "") {
      nodes.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // Normal paragraph line
    nodes.push(
      <p key={i} className="text-xs leading-relaxed">
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return <>{nodes}</>;
}

/** Inline bold (**text**) and code (`text`) formatting. */
function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-[var(--text)]">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="font-mono text-[10px] bg-[var(--bg-3)] px-1 py-0.5 rounded">{part.slice(1, -1)}</code>;
    return part;
  });
}

export function CopilotPanel({ orgId }: Props) {
  const [open,     setOpen]     = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input,    setInput]    = React.useState("");
  const [loading,  setLoading]  = React.useState(false);
  const [loadingLabel, setLoadingLabel] = React.useState("Thinking...");
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Rotate loading label to hint at what Ace might be doing
  React.useEffect(() => {
    if (!loading) return;
    const labels = ["Thinking...", "Checking your data...", "Analyzing pipeline...", "Fetching numbers..."];
    let idx = 0;
    const t = setInterval(() => {
      idx = (idx + 1) % labels.length;
      setLoadingLabel(labels[idx]);
    }, 1800);
    return () => clearInterval(t);
  }, [loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content }]);
    setLoading(true);
    setLoadingLabel("Thinking...");
    try {
      const res = await fetch(`/api/orgs/${orgId}/copilot/message`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: content }),
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* non-json */ }

      if (!res.ok) {
        const errMsg = (data.error as string) ?? `Error ${res.status}`;
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${errMsg}` }]);
      } else if (data.reply) {
        setMessages((m) => [...m, {
          role:       "assistant",
          content:    data.reply as string,
          tools_used: (data.tools_used as string[] | undefined) ?? [],
        }]);
      }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "Network error";
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function clearChat() {
    setMessages([]);
  }

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Ace copilot"
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand)] shadow-lg shadow-[var(--brand)]/30 hover:opacity-90 transition-opacity"
        >
          <Sparkles className="h-5 w-5 text-[#0A0A0C]" />
        </button>
      )}

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="copilot-panel"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 20,    scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-0 right-0 z-50 flex flex-col w-full sm:w-[400px] h-[580px] sm:h-[600px] sm:bottom-6 sm:right-6 border border-[var(--border)] bg-[var(--bg-1)] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[var(--brand)]/20 flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--brand)]" />
                </div>
                <span className="text-sm font-semibold text-[var(--text)]">Strategic Copilot</span>
                <span className="text-[10px] text-[var(--brand)] border border-[var(--brand)]/30 rounded px-1.5 py-0.5">Ace</span>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="text-[10px] text-[var(--text-3)] hover:text-[var(--text-2)] px-2 py-1 rounded transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs text-[var(--text-3)] text-center pt-2">
                    Ask Ace anything about your business. It reads your live data.
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {QUICK_ACTIONS.map((a) => (
                      <button
                        key={a.label}
                        onClick={() => send(a.label)}
                        className="w-full flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-left text-xs text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:border-[var(--brand)]/30 transition-colors group"
                      >
                        <span className="flex items-center gap-2">
                          <span>{a.icon}</span>
                          {a.label}
                        </span>
                        <ChevronRight className="h-3 w-3 text-[var(--text-3)] group-hover:text-[var(--brand)] transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[90%] rounded-[var(--radius-lg)] px-3 py-2.5",
                    m.role === "user"
                      ? "bg-[var(--brand)]/15 text-[var(--text)] rounded-br-sm text-xs leading-relaxed"
                      : "bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-2)] rounded-bl-sm"
                  )}>
                    {m.role === "assistant" ? renderMarkdown(m.content) : m.content}
                  </div>
                  {m.role === "assistant" && m.tools_used && m.tools_used.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 px-1">
                      <Database className="h-2.5 w-2.5 text-[var(--text-3)]" />
                      <span className="text-[10px] text-[var(--text-3)]">
                        {Array.from(new Set(m.tools_used)).map((t) => TOOL_LABELS[t] ?? t).slice(0, 3).join(" · ")}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex flex-col items-start gap-1">
                  <div className="bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--radius-lg)] rounded-bl-sm px-3 py-2 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin text-[var(--brand)] shrink-0" />
                    <span className="text-xs text-[var(--text-3)]">{loadingLabel}</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[var(--border)] px-3 py-3 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  rows={1}
                  placeholder="Ask Ace…"
                  disabled={loading}
                  className="flex-1 resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] max-h-[120px] min-h-[36px] disabled:opacity-60"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--brand)] text-[#0A0A0C] hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
