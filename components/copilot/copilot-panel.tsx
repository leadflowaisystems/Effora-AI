"use client";

import * as React from "react";
import { Sparkles, X, Send, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role:    "user" | "assistant";
  content: string;
}

interface Props {
  orgId:   string;
  orgSlug: string;
}

const SUGGESTIONS = [
  "Show me my top 3 hottest leads",
  "What's my revenue last week vs prior?",
  "Which lead should I prioritize today?",
  "What's my conversion rate this month?",
  "How do I price my new program?",
];

export function CopilotPanel({ orgId }: Props) {
  const [open,     setOpen]     = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input,    setInput]    = React.useState("");
  const [loading,  setLoading]  = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content }]);
    setLoading(true);
    try {
      const res  = await fetch(`/api/orgs/${orgId}/copilot/message`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: content }),
      });
      const data = await res.json();
      if (data.reply) setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
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
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-0 right-0 z-50 flex flex-col w-full sm:w-[380px] h-[560px] sm:h-[580px] sm:bottom-6 sm:right-6 border border-[var(--border)] bg-[var(--bg-1)] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
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
              <button onClick={() => setOpen(false)} className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--text-3)] text-center pt-4">
                    Ask Ace anything about your business strategy.
                  </p>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-left text-xs text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors group"
                    >
                      {s}
                      <ChevronRight className="h-3 w-3 text-[var(--text-3)] group-hover:text-[var(--brand)] transition-colors" />
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-[var(--radius-lg)] px-3 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-[var(--brand)]/20 text-[var(--text)] rounded-br-sm"
                      : "bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-2)] rounded-bl-sm"
                  )}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--radius-lg)] rounded-bl-sm px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-3)]" />
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
                  className="flex-1 resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] max-h-[120px] min-h-[36px]"
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
