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
import type { InboxConversation }    from "@/types/inbox";

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
          conversations={conversations}
          onNewDm={() => setDmOpen(true)}
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
