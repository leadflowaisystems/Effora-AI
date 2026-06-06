"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Plus, Zap, AlertTriangle } from "lucide-react";
import { Switch }                    from "@/components/ui/switch";
import { ConversationListPanel }     from "./conversation-list-panel";
import { NewDmSheet }                from "./new-dm-sheet";
import { RemovedToast }              from "./removed-toast";
import { formatInr }                 from "@/lib/time";
import { cn }                        from "@/lib/utils";
import { getInboxCache, setInboxCache } from "@/lib/inbox-cache";
import { createClient }              from "@/lib/supabase/client";
import type { InboxConversation, InboxLead } from "@/types/inbox";
import type { LeadStage }            from "@/types/database";

interface Props {
  orgSlug:            string;
  orgId:              string;
  orgName:            string;
  autoSendReplies:    boolean;
  conversations:      InboxConversation[];
  monthCostInr:       number;
  aiMsgsPerMonth?:    number;   // -1 = unlimited
  monthlyAiMsgCount?: number;
  children:           React.ReactNode;
}

// ── Sort helper (module-level, not re-created on every render) ────────────────
function sortByLastMessage(list: InboxConversation[]): InboxConversation[] {
  return [...list].sort((a, b) => {
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });
}

export function InboxShell({
  orgSlug,
  orgId,
  orgName,
  autoSendReplies: initialAutoSend,
  conversations: serverConversations,
  monthCostInr,
  aiMsgsPerMonth   = -1,
  monthlyAiMsgCount = 0,
  children,
}: Props) {
  const pathname  = usePathname();
  const [dmOpen,     setDmOpen]     = React.useState(false);
  const [autoSend,   setAutoSend]   = React.useState(initialAutoSend);
  const [savingAuto, setSavingAuto] = React.useState(false);

  // ── Conversation list state ───────────────────────────────────────────────
  // Seed from cache (instant, avoids flash) then merge with server data.
  const cached = React.useMemo(() => getInboxCache(orgId), [orgId]);
  const [conversations, setConversations] = React.useState<InboxConversation[]>(
    cached ?? serverConversations,
  );

  // Keep a ref always in sync with state so async realtime handlers can read
  // the current list without stale closures.
  const conversationsRef = React.useRef<InboxConversation[]>(conversations);
  React.useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // Smart merge: when server data arrives (initial mount + org navigation),
  // incorporate new conversations we don't have yet but preserve any realtime-
  // updated timestamps that are newer than what the server returned.
  React.useEffect(() => {
    setConversations((prev) => {
      // First mount or org change — prev is either cache or the same server data.
      // Build a map of what we already know.
      const prevMap = new Map(prev.map((c) => [c.id, c]));

      const merged = serverConversations.map((sc) => {
        const existing = prevMap.get(sc.id);
        if (!existing) return sc; // new from server — add it
        // Keep whichever timestamp is more recent (realtime may be ahead of server)
        const existingTs = existing.last_message_at
          ? new Date(existing.last_message_at).getTime() : 0;
        const serverTs   = sc.last_message_at
          ? new Date(sc.last_message_at).getTime() : 0;
        return existingTs >= serverTs ? existing : { ...sc, lead: existing.lead ?? sc.lead };
      });

      // Preserve realtime-added conversations not yet in server's 60-item window
      prev.forEach((c) => {
        if (!serverConversations.some((sc) => sc.id === c.id)) merged.push(c);
      });

      const sorted = sortByLastMessage(merged);
      setInboxCache(orgId, sorted);
      return sorted;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, serverConversations]);

  // ── Supabase Realtime ────────────────────────────────────────────────────
  // Now that conversations + ai_drafts are in the supabase_realtime publication
  // (migration 024), these subscriptions receive real events.
  //
  // Latency chain after migration:
  //   DB write → WAL → Supabase realtime broker → client websocket → setState
  //   Typical: 50–300 ms end-to-end from DB commit to UI update.
  React.useEffect(() => {
    const supabase = createClient();
    const t_subscribe = performance.now();

    const channel = supabase
      .channel(`inbox-shell:${orgId}`)

      // ── New conversation (first DM from a new lead) ───────────────────────
      // Render immediately from payload.new, enrich lead in background.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations", filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const t0 = performance.now();
          const raw = payload.new as {
            id: string; channel_provider: string; last_message_at: string | null;
            last_message_preview: string | null; lead_id: string;
          };

          // Add placeholder immediately — zero latency to UI
          const placeholder: InboxConversation = {
            id:                   raw.id,
            channel_provider:     raw.channel_provider,
            last_message_at:      raw.last_message_at,
            last_message_preview: raw.last_message_preview ?? null,
            hasPendingDraft:      false,
            lead:                 null,
          };
          setConversations((prev) => {
            if (prev.some((c) => c.id === raw.id)) return prev;
            const next = sortByLastMessage([placeholder, ...prev]);
            setInboxCache(orgId, next);
            return next;
          });
          console.log(`[inbox-perf] conv INSERT rendered in ${(performance.now() - t0).toFixed(1)}ms`);

          // Enrich lead name/stage in background (non-blocking)
          try {
            const res = await fetch(`/api/orgs/${orgId}/conversations/${raw.id}`);
            if (!res.ok) return;
            const json = await res.json() as { conversation: { id: string; lead: InboxLead | null } };
            const leadRaw = json.conversation.lead;
            if (!leadRaw) return;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === raw.id
                  ? { ...c, lead: { ...leadRaw, stage: leadRaw.stage as LeadStage } }
                  : c,
              ),
            );
          } catch { /* placeholder stays until next mount */ }
        },
      )

      // ── Existing conversation updated (any new message) ───────────────────
      // Re-sort immediately. If conv is outside the 60-item window, fetch + prepend.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const t0 = performance.now();
          const upd = payload.new as {
            id: string; last_message_at: string | null;
            last_message_preview: string | null; lead_id: string;
          };

          // Check membership without a state-setter side-effect
          const exists = conversationsRef.current.some((c) => c.id === upd.id);

          if (exists) {
            setConversations((prev) => {
              const next = sortByLastMessage(
                prev.map((c) =>
                  c.id === upd.id
                    ? { ...c, last_message_at: upd.last_message_at, last_message_preview: upd.last_message_preview }
                    : c,
                ),
              );
              setInboxCache(orgId, next);
              return next;
            });
            console.log(`[inbox-perf] conv UPDATE re-sorted in ${(performance.now() - t0).toFixed(1)}ms`);
          } else {
            // Conv not in current window — fetch full data and prepend
            try {
              const res = await fetch(`/api/orgs/${orgId}/conversations/${upd.id}`);
              if (!res.ok) return;
              const json = await res.json() as {
                conversation: { id: string; channel_provider: string; last_message_at: string | null; lead: InboxLead | null };
              };
              const conv = json.conversation;
              setConversations((prev) => {
                if (prev.some((c) => c.id === conv.id)) return prev;
                const next = sortByLastMessage([{
                  id:                   conv.id,
                  channel_provider:     conv.channel_provider,
                  last_message_at:      upd.last_message_at,
                  last_message_preview: upd.last_message_preview,
                  hasPendingDraft:      false,
                  lead:                 conv.lead ? { ...conv.lead, stage: conv.lead.stage as LeadStage } : null,
                }, ...prev]);
                setInboxCache(orgId, next);
                return next;
              });
              console.log(`[inbox-perf] conv UPDATE (outside window) fetched+prepended in ${(performance.now() - t0).toFixed(1)}ms`);
            } catch { /* non-fatal */ }
          }
        },
      )

      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[inbox-perf] realtime channel SUBSCRIBED in ${(performance.now() - t_subscribe).toFixed(1)}ms — org=${orgId}`);
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [orgId]);

  // ── Optimistic sort (0ms) — from compose bar and AI draft card ───────────
  // Fires before realtime arrives (~50–300ms), gives instant visual feedback.
  React.useEffect(() => {
    function onConversationUpdated(e: Event) {
      const { convId, timestamp } = (e as CustomEvent<{ convId: string; timestamp: string }>).detail;
      setConversations((prev) => {
        if (!prev.some((c) => c.id === convId)) return prev;
        const next = sortByLastMessage(
          prev.map((c) => c.id === convId ? { ...c, last_message_at: timestamp } : c),
        );
        setInboxCache(orgId, next);
        return next;
      });
    }

    // Update hasPendingDraft when AI draft is resolved (approved/rejected)
    function onDraftResolved(e: Event) {
      const { convId } = (e as CustomEvent<{ convId: string }>).detail;
      setConversations((prev) =>
        prev.map((c) => c.id === convId ? { ...c, hasPendingDraft: false } : c),
      );
    }

    // Update hasPendingDraft when a new AI draft arrives (realtime INSERT on ai_drafts
    // triggers this event from thread-view's subscription)
    function onDraftCreated(e: Event) {
      const { convId } = (e as CustomEvent<{ convId: string }>).detail;
      setConversations((prev) =>
        prev.map((c) => c.id === convId ? { ...c, hasPendingDraft: true } : c),
      );
    }

    window.addEventListener("conversation-updated", onConversationUpdated);
    window.addEventListener("draft-resolved",       onDraftResolved);
    window.addEventListener("draft-created",        onDraftCreated);
    return () => {
      window.removeEventListener("conversation-updated", onConversationUpdated);
      window.removeEventListener("draft-resolved",       onDraftResolved);
      window.removeEventListener("draft-created",        onDraftCreated);
    };
  }, [orgId]);

  // On mobile: hide list when inside a conversation
  const inThread = /\/inbox\/[^/]+/.test(pathname);

  async function toggleAutoSend(val: boolean) {
    setAutoSend(val);
    setSavingAuto(true);
    try {
      await fetch(`/api/orgs/${orgId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ auto_send_replies: val }),
      });
    } catch { /* non-fatal */ }
    finally { setSavingAuto(false); }
  }

  // AI limit banner
  const isUnlimited = aiMsgsPerMonth === -1;
  const isAtLimit   = !isUnlimited && monthlyAiMsgCount >= aiMsgsPerMonth;
  const isNearLimit = !isUnlimited && !isAtLimit && aiMsgsPerMonth > 0
    && (monthlyAiMsgCount / aiMsgsPerMonth) >= 0.8;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((monthlyAiMsgCount / Math.max(aiMsgsPerMonth, 1)) * 100));

  return (
    <div
      className="relative -m-4 md:-m-6 flex overflow-hidden bg-[var(--bg)]"
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      <RemovedToast />

      {/* ── Left panel ────────────────────────────── */}
      <div className={cn(
        "flex w-[300px] shrink-0 flex-col overflow-hidden border-r border-[var(--border)]",
        inThread ? "hidden md:flex" : "flex"
      )}>
        {/* Mini toolbar */}
        <div className="flex h-9 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-1)] px-3">
          <div className="flex items-center gap-1.5">
            <Switch
              id="auto-send"
              checked={autoSend}
              onCheckedChange={toggleAutoSend}
              disabled={savingAuto}
              aria-label="Auto-send replies"
            />
            <label htmlFor="auto-send" className="text-[11px] text-[var(--text-3)] cursor-pointer select-none">
              Auto-send
            </label>
          </div>
          {monthCostInr > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-3)]">
              <Zap className="h-2.5 w-2.5 text-[var(--brand)]" />
              {formatInr(monthCostInr)} this month
            </div>
          )}
        </div>

        {/* AI limit banner */}
        {(isAtLimit || isNearLimit) && (
          <Link
            href={`/org/${orgSlug}/settings/billing`}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b px-3 py-2 text-[11px] transition-colors hover:opacity-90",
              isAtLimit
                ? "border-red-500/30 bg-red-500/10 text-red-400"
                : "border-amber-500/30 bg-amber-500/10 text-amber-400"
            )}
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="flex-1 min-w-0">
              {isAtLimit
                ? `AI limit reached (${monthlyAiMsgCount}/${aiMsgsPerMonth})`
                : `${pct}% of AI replies used`}
            </span>
            <span className="shrink-0 font-medium underline underline-offset-2">Upgrade</span>
          </Link>
        )}

        <ConversationListPanel
          orgSlug={orgSlug}
          orgId={orgId}
          conversations={conversations}
          onNewDm={() => setDmOpen(true)}
          onDelete={(id) => setConversations((prev) => prev.filter((c) => c.id !== id))}
        />
      </div>

      {/* ── Right panel ───────────────────────────── */}
      <div className={cn(
        "flex flex-1 flex-col overflow-hidden min-w-0",
        !inThread && "hidden md:flex"
      )}>
        {children}
      </div>

      <NewDmSheet
        open={dmOpen}
        onOpenChange={setDmOpen}
        orgId={orgId}
        orgSlug={orgSlug}
      />
    </div>
  );
}
