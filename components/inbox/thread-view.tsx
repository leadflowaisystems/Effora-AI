"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Instagram, Phone, MessageSquare, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn }        from "@/lib/utils";
import { Badge }     from "@/components/ui/badge";
import { Skeleton }  from "@/components/ui/skeleton";
import { AiDraftCard } from "./ai-draft-card";
import { ComposeBar  } from "./compose-bar";
import { linkify }     from "./linkify";
import { timeAgo }   from "@/lib/time";
import { createClient } from "@/lib/supabase/client";
import type { InboxMessage, InboxDraft, InboxLead } from "@/types/inbox";

// NOTE: useRouter is intentionally absent. router.refresh() has been
// removed — it caused layout re-renders, state overwrites, and visible
// flicker on every send. All updates now flow through Supabase Realtime
// (conversations + ai_drafts in publication after migration 024) and
// optimistic CustomEvent dispatches. No polling. No server re-fetches.

interface Props {
  orgId:            string;
  orgSlug:          string;
  convId:           string;
  lead:             InboxLead | null;
  channelProvider?: string;
  initialMessages:  InboxMessage[];
  initialDraft:     InboxDraft | null;
}

function ChannelTag({ provider }: { provider?: string }) {
  if (!provider) return null;
  if (provider === "meta_instagram") return (
    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 shrink-0">
      <Instagram className="h-2.5 w-2.5" /> Instagram
    </span>
  );
  if (provider === "whatsapp_cloud") return (
    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] border border-[var(--brand)]/20 shrink-0">
      <Phone className="h-2.5 w-2.5" /> WhatsApp
    </span>
  );
  if (provider === "manual" || provider === "manual_crm") return null;
  return (
    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-3)] text-[var(--text-3)] border border-[var(--border)] shrink-0">
      <MessageSquare className="h-2.5 w-2.5" /> {provider}
    </span>
  );
}

const STAGE_BADGE: Record<string, Parameters<typeof Badge>[0]["variant"]> = {
  hot: "hot", warm: "warm", cold: "cold",
};

function MessageBubble({ msg, onRetry }: { msg: InboxMessage; onRetry?: (m: InboxMessage) => void }) {
  const isOut = msg.direction === "outbound";
  const isAi  = msg.metadata?.source === "ai";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex", isOut ? "justify-end" : "justify-start")}
    >
      <div className={cn(
        "max-w-[72%] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm leading-relaxed",
        isOut
          ? "bg-[var(--brand-glow)] border border-[var(--brand)]/30 text-[var(--text)]"
          : "bg-[var(--bg-3)] border border-[var(--border)] text-[var(--text)]"
      )}>
        {isAi && !msg.metadata?.["delivery_error"] && (
          <span className="mb-1 flex items-center gap-1 text-[10px] text-[var(--brand)] font-medium">
            ✨ AI sent
          </span>
        )}
        {isAi && !!msg.metadata?.["delivery_error"] && (
          <span className="mb-1 flex items-center gap-1 text-[10px] text-amber-400 font-medium">
            ⚠ AI generated — not delivered to Instagram
          </span>
        )}
        {msg.metadata?.["attachment_url"] ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={msg.metadata["attachment_url"] as string}
              alt="Image attachment"
              className="max-w-[240px] rounded-lg object-cover mb-1"
            />
            {msg.content && msg.content !== "📷 Image" && (
              <p className="whitespace-pre-wrap break-words text-sm">{linkify(msg.content)}</p>
            )}
          </>
        ) : (
          <p className="whitespace-pre-wrap break-words">{linkify(msg.content)}</p>
        )}
        <p className={cn(
          "mt-1 text-[10px] flex items-center gap-1",
          isOut ? "text-[var(--brand)]/60 justify-end" : "text-[var(--text-3)]"
        )}>
          {msg.sendState === "sending" ? (
            <>
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Sending…
            </>
          ) : msg.sendState === "failed" ? (
            <>
              <AlertCircle className="h-2.5 w-2.5 text-red-400" />
              <span className="text-red-400">Not sent</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={() => onRetry(msg)}
                  className="ml-1 underline underline-offset-2 text-red-400 hover:text-red-300 transition-colors"
                >
                  Retry
                </button>
              )}
            </>
          ) : (
            timeAgo(msg.sent_at)
          )}
        </p>
        {msg.sendState === "failed" && msg.sendError && (
          <p className="mt-0.5 text-[10px] text-red-400/70 text-right max-w-[240px] break-words">
            {msg.sendError}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function ThreadView({ orgId, orgSlug, convId, lead, channelProvider, initialMessages, initialDraft }: Props) {
  const [messages, setMessages] = React.useState<InboxMessage[]>(initialMessages);
  const [draft,    setDraft]    = React.useState<InboxDraft | null>(initialDraft);
  // Set when a failed send is retried — refills the composer with that text.
  const [retryText, setRetryText] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const mountedAt = React.useRef<number>(performance.now());

  // Scroll to bottom on mount and new messages
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Realtime: new messages in this thread ─────────────────────────────────
  // messages table has been in supabase_realtime since initial setup.
  // Catches: inbound DMs (webhook), manual replies, AI-approved messages,
  // payment/booking messages from Inngest, and any other automated outbound.
  React.useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`thread:${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const t0 = performance.now();
          const newMsg = payload.new as {
            id: string; direction: string; content: string; sent_at: string; metadata: Record<string, unknown>;
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev; // dedup with optimistic add
            // Realtime can beat the HTTP response. If a still-pending optimistic
            // bubble matches this row, upgrade it in place rather than appending
            // a second copy of the same message.
            const pendingIdx = prev.findIndex(
              (m) =>
                m.sendState === "sending" &&
                m.direction === "outbound" &&
                newMsg.direction === "outbound" &&
                m.content === newMsg.content,
            );
            if (pendingIdx !== -1) {
              const upgraded = [...prev];
              upgraded[pendingIdx] = {
                ...upgraded[pendingIdx],
                id:        newMsg.id,
                sent_at:   newMsg.sent_at,
                metadata:  newMsg.metadata ?? {},
                sendState: undefined,
              };
              return upgraded;
            }
            const updated = [...prev, {
              id:        newMsg.id,
              direction: newMsg.direction as "inbound" | "outbound",
              content:   newMsg.content,
              sent_at:   newMsg.sent_at,
              metadata:  newMsg.metadata ?? {},
            }];
            const elapsed = (performance.now() - t0).toFixed(1);
            const sessionMs = (performance.now() - mountedAt.current).toFixed(0);
            console.log(`[inbox-perf] message INSERT visible +${elapsed}ms (session=${sessionMs}ms) dir=${newMsg.direction} id=${newMsg.id}`);
            return updated;
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [convId]);

  // ── Realtime: AI draft for this conversation ──────────────────────────────
  // ai_drafts added to supabase_realtime publication (migration 024).
  // Replaces the previous 5-second setInterval poll — drafts now appear
  // within ~100ms of Inngest inserting them, not up to 5000ms later.
  React.useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`drafts:${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_drafts", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const t0 = performance.now();
          const d = payload.new as {
            id: string; content: string; status: string;
            edited_content: string | null; created_at: string;
          };
          if (d.status !== "pending") return;
          setDraft({
            id:             d.id,
            content:        d.content,
            status:         "pending",
            edited_content: d.edited_content,
            created_at:     d.created_at,
          });
          console.log(`[inbox-perf] AI draft INSERT visible +${(performance.now() - t0).toFixed(1)}ms`);
          // Signal inbox sidebar to light up the draft indicator
          window.dispatchEvent(new CustomEvent("draft-created", { detail: { convId } }));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [convId]);

  function handleDraftDone(newMsg?: { id: string; content: string; sent_at: string; direction: "outbound" }) {
    setDraft(null);
    if (newMsg) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, { ...newMsg, metadata: { source: "ai" } }];
      });
      // Optimistic sort: move conversation to top immediately
      window.dispatchEvent(new CustomEvent("conversation-updated", {
        detail: { convId, timestamp: newMsg.sent_at },
      }));
    }
    // Clear pending draft indicator in sidebar — no router.refresh() needed
    window.dispatchEvent(new CustomEvent("draft-resolved", { detail: { convId } }));
  }

  function handleSent(msg: InboxMessage) {
    // Dedup: realtime INSERT may fire before HTTP response returns
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    // Optimistic sort dispatched by ComposeBar immediately after fetch resolves.
    // No router.refresh() — realtime conversation UPDATE handles sidebar preview.
  }

  /**
   * Reconcile an optimistic bubble once the server responds.
   * On success the temp id is swapped for the real one, which also lets the
   * realtime dedup-by-id check suppress the duplicate INSERT event.
   */
  function handleSentResolved(
    tempId: string,
    patch: Partial<InboxMessage> & { id?: string },
  ) {
    setMessages((prev) => {
      // If realtime already delivered the real row, drop the temp instead of
      // renaming it — otherwise the same message would appear twice.
      if (patch.id && prev.some((m) => m.id === patch.id)) {
        return prev.filter((m) => m.id !== tempId);
      }
      return prev.map((m) => (m.id === tempId ? { ...m, ...patch } : m));
    });
  }

  /** Re-send a failed message: drop the failed bubble, refill the composer. */
  function handleRetry(msg: InboxMessage) {
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    setRetryText(msg.content);
  }

  const stage = lead?.stage ?? "cold";
  const score = lead?.score ?? 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-w-0">

      {/* ── Thread header ── */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-1)] px-4">
        <Link
          href={`/org/${orgSlug}/inbox`}
          className="md:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] transition-colors"
          aria-label="Back to inbox list"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-sm font-semibold text-[var(--text)] truncate">
              {(() => {
                const name  = lead?.name;
                const rawId = lead?.external_id?.replace(/^ig_/, "") ?? "";
                const isPlaceholder =
                  !name || name === rawId || /^\d{10,}$/.test(name) ||
                  name.startsWith("IG …") || name.startsWith("IG .") || name.startsWith("@IG ");
                if (isPlaceholder) {
                  return rawId.length > 6 ? `IG …${rawId.slice(-6)}` : (rawId || "Instagram User");
                }
                return name;
              })()}
            </span>
            {lead?.stage && (
              <Badge variant={STAGE_BADGE[stage] ?? "muted"} className="text-[10px] px-1.5 py-0 shrink-0">
                {stage.charAt(0).toUpperCase() + stage.slice(1)}
              </Badge>
            )}
            <ChannelTag provider={channelProvider} />
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
            <MessageBubble key={msg.id} msg={msg} onRetry={handleRetry} />
          ))}
        </AnimatePresence>

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
      <ComposeBar
        orgId={orgId}
        convId={convId}
        onSent={handleSent}
        onSentResolved={handleSentResolved}
        channelProvider={channelProvider}
        refillText={retryText}
        onRefillConsumed={() => setRetryText(null)}
      />
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
