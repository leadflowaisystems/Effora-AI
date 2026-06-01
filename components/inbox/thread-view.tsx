"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn }        from "@/lib/utils";
import { Badge }     from "@/components/ui/badge";
import { Skeleton }  from "@/components/ui/skeleton";
import { AiDraftCard } from "./ai-draft-card";
import { ComposeBar  } from "./compose-bar";
import { timeAgo }   from "@/lib/time";
import { createClient } from "@/lib/supabase/client";
import type { InboxMessage, InboxDraft, InboxLead } from "@/types/inbox";

interface Props {
  orgId:        string;
  orgSlug:      string;
  convId:       string;
  lead:         InboxLead | null;
  initialMessages: InboxMessage[];
  initialDraft: InboxDraft | null;
}

/* ── Stage badge styling ── */
const STAGE_BADGE: Record<string, Parameters<typeof Badge>[0]["variant"]> = {
  hot:  "hot",  warm: "warm", cold: "cold",
};

/* ── Message bubble ── */
function MessageBubble({ msg }: { msg: InboxMessage }) {
  const isOut = msg.direction === "outbound";
  const isAi  = msg.metadata?.source === "ai";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex", isOut ? "justify-end" : "justify-start")}
    >
      <div className={cn(
        "max-w-[72%] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm leading-relaxed",
        isOut
          ? "bg-[var(--brand-glow)] border border-[var(--brand)]/30 text-[var(--text)]"
          : "bg-[var(--bg-3)] border border-[var(--border)] text-[var(--text)]"
      )}>
        {isAi && (
          <span className="mb-1 flex items-center gap-1 text-[10px] text-[var(--brand)] font-medium">
            ✨ AI sent
          </span>
        )}
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        <p className={cn(
          "mt-1 text-[10px]",
          isOut ? "text-[var(--brand)]/60 text-right" : "text-[var(--text-3)]"
        )}>
          {timeAgo(msg.sent_at)}
        </p>
      </div>
    </motion.div>
  );
}

/* ── Thread view ── */
export function ThreadView({ orgId, orgSlug, convId, lead, initialMessages, initialDraft }: Props) {
  const router   = useRouter();
  const [messages, setMessages] = React.useState<InboxMessage[]>(initialMessages);
  const [draft,    setDraft]    = React.useState<InboxDraft | null>(initialDraft);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom on mount and when messages change
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Supabase Realtime: subscribe to new messages for this conversation.
  // Falls back to 5s polling for AI drafts (which come via Inngest, not direct DB insert the realtime catches).
  React.useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`conversation:${convId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "messages",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const newMsg = payload.new as {
            id: string; direction: string; content: string; sent_at: string; metadata: Record<string, unknown>;
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, {
              id:        newMsg.id,
              direction: newMsg.direction as "inbound" | "outbound",
              content:   newMsg.content,
              sent_at:   newMsg.sent_at,
              metadata:  newMsg.metadata ?? {},
            }];
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [convId]);

  // Poll every 5 s to pick up Inngest-generated drafts (ai_drafts table not in realtime scope)
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/conversations/${convId}`);
        if (!res.ok) return;
        const json = await res.json() as { pendingDraft?: InboxDraft | null };
        if (json.pendingDraft && !draft) {
          setDraft(json.pendingDraft);
        }
      } catch { /* non-fatal */ }
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, convId]);

  function handleDraftDone(newMsg?: { id: string; content: string; sent_at: string; direction: "outbound" }) {
    setDraft(null);
    if (newMsg) {
      setMessages((prev) => [...prev, { ...newMsg, metadata: { source: "ai" } }]);
    }
    router.refresh();
  }

  function handleSent(msg: InboxMessage) {
    setMessages((prev) => [...prev, msg]);
    router.refresh();
  }

  const stage = lead?.stage ?? "cold";
  const score = lead?.score ?? 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-w-0">

      {/* ── Thread header ── */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-1)] px-4">
        {/* Mobile back button */}
        <Link
          href={`/org/${orgSlug}/inbox`}
          className="md:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] transition-colors"
          aria-label="Back to inbox list"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold text-[var(--text)] truncate">
              {lead?.name ?? lead?.external_id ?? "Unknown lead"}
            </span>
            {lead?.stage && (
              <Badge variant={STAGE_BADGE[stage] ?? "muted"} className="text-[10px] px-1.5 py-0 shrink-0">
                {stage.charAt(0).toUpperCase() + stage.slice(1)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-[var(--text-3)] truncate">
            {lead?.external_id ?? ""}{score > 0 ? ` · ${score}/100` : ""}
          </p>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[var(--text-3)]">No messages yet.</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
        </AnimatePresence>

        {/* AI Draft card (pinned above compose) */}
        <AnimatePresence>
          {draft && (
            <AiDraftCard
              key={draft.id}
              draft={draft}
              orgId={orgId}
              convId={convId}
              onDone={handleDraftDone}
            />
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* ── Compose bar ── */}
      <ComposeBar orgId={orgId} convId={convId} onSent={handleSent} />
    </div>
  );
}

/* ── Loading skeleton ── */
export function ThreadSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-14 items-center gap-3 border-b border-[var(--border)] px-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-12" />
      </div>
      <div className="flex-1 px-4 py-4 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
            <Skeleton className="h-12 rounded-[var(--radius-md)]" style={{ width: `${40 + (i * 7) % 30}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
