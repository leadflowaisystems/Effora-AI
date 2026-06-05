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

  // Show cached conversations instantly while server data loads in the background.
  // On first mount the server prop is authoritative; we warm the cache from it.
  const cached = React.useMemo(() => getInboxCache(orgId), [orgId]);
  const [conversations, setConversations] = React.useState<InboxConversation[]>(
    cached ?? serverConversations,
  );
  React.useEffect(() => {
    // Sync server data into state + cache whenever the layout re-renders
    setConversations(serverConversations);
    setInboxCache(orgId, serverConversations);
  }, [orgId, serverConversations]);

  // Realtime: subscribe to conversation INSERT/UPDATE for this org so new Instagram
  // DMs appear in the sidebar within ~1 second without waiting for layout re-render.
  React.useEffect(() => {
    const supabase = createClient();

    const sortDesc = (list: InboxConversation[]) =>
      [...list].sort((a, b) => {
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

    const channel = supabase
      .channel(`inbox-shell:${orgId}`)
      // New conversation created (new lead messaged for the first time).
      // Build the item immediately from payload.new so it appears instantly, then
      // enrich lead data asynchronously — eliminates the blocking API round-trip.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations", filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const raw = payload.new as {
            id: string; channel_provider: string; last_message_at: string | null;
            last_message_preview: string | null; lead_id: string;
          };
          // Add conversation immediately with unknown lead (shows ID as name until enriched)
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
            const next = sortDesc([placeholder, ...prev]);
            setInboxCache(orgId, next);
            return next;
          });

          // Enrich with lead data in the background (non-blocking)
          try {
            const res = await fetch(`/api/orgs/${orgId}/conversations/${raw.id}`);
            if (!res.ok) return;
            const json = await res.json() as {
              conversation: { id: string; lead: InboxLead | null };
            };
            const leadRaw = json.conversation.lead;
            if (!leadRaw) return;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === raw.id
                  ? { ...c, lead: { ...leadRaw, stage: leadRaw.stage as LeadStage } }
                  : c,
              ),
            );
          } catch { /* non-fatal — placeholder stays until next page load */ }
        },
      )
      // Existing conversation updated (new message from any source).
      // If the conversation is already in the list, update + re-sort.
      // If not (e.g., beyond the initial 60-item limit), fetch it and insert at top.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const upd = payload.new as {
            id: string; last_message_at: string | null; last_message_preview: string | null; lead_id: string;
          };
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === upd.id);
            if (exists) {
              const next = sortDesc(
                prev.map((c) =>
                  c.id === upd.id
                    ? { ...c, last_message_at: upd.last_message_at, last_message_preview: upd.last_message_preview }
                    : c,
                ),
              );
              setInboxCache(orgId, next);
              return next;
            }
            // Conversation not in current list — fetch and prepend it
            fetch(`/api/orgs/${orgId}/conversations/${upd.id}`)
              .then((r) => r.ok ? r.json() : null)
              .then((json: { conversation: { id: string; channel_provider: string; last_message_at: string | null; lead: InboxLead | null } } | null) => {
                if (!json) return;
                const conv = json.conversation;
                setConversations((p) => {
                  if (p.some((c) => c.id === conv.id)) return p;
                  const next = sortDesc([{
                    id:                   conv.id,
                    channel_provider:     conv.channel_provider,
                    last_message_at:      upd.last_message_at,
                    last_message_preview: upd.last_message_preview,
                    hasPendingDraft:      false,
                    lead:                 conv.lead ? { ...conv.lead, stage: conv.lead.stage as LeadStage } : null,
                  }, ...p]);
                  setInboxCache(orgId, next);
                  return next;
                });
              })
              .catch(() => null);
            return prev; // return unchanged for now; fetch above will update
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId]);

  // Optimistic sort: listen for a custom DOM event fired by ComposeBar/ThreadView
  // after a message is sent. Moves the conversation to the top instantly (0ms),
  // before the Supabase realtime event arrives (~0.5–2 s later).
  React.useEffect(() => {
    function handleConversationUpdated(e: Event) {
      const { convId, timestamp } = (e as CustomEvent<{ convId: string; timestamp: string }>).detail;
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === convId);
        if (!exists) return prev;
        const sortDesc = (list: InboxConversation[]) =>
          [...list].sort((a, b) => {
            if (!a.last_message_at) return 1;
            if (!b.last_message_at) return -1;
            return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
          });
        const next = sortDesc(
          prev.map((c) =>
            c.id === convId ? { ...c, last_message_at: timestamp } : c,
          ),
        );
        setInboxCache(orgId, next);
        return next;
      });
    }
    window.addEventListener("conversation-updated", handleConversationUpdated);
    return () => window.removeEventListener("conversation-updated", handleConversationUpdated);
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
    // Full-bleed: cancel AppShell's p-4 md:p-6 padding so split pane reaches edges
    <div
      className="relative -m-4 md:-m-6 flex overflow-hidden bg-[var(--bg)]"
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      {/* Soft toast when a stale convId redirects back here */}
      <RemovedToast />
      {/* ── Left panel ────────────────────────────── */}
      <div className={cn(
        "flex w-[300px] shrink-0 flex-col overflow-hidden border-r border-[var(--border)]",
        inThread ? "hidden md:flex" : "flex"
      )}>
        {/* Mini toolbar above list — auto-send toggle + usage */}
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

        {/* AI limit banner — shown when >= 80% used or at limit */}
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
            <span className="shrink-0 font-medium underline underline-offset-2">
              Upgrade
            </span>
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

      {/* ── New DM sheet ──────────────────────────── */}
      <NewDmSheet
        open={dmOpen}
        onOpenChange={setDmOpen}
        orgId={orgId}
        orgSlug={orgSlug}
      />
    </div>
  );
}
