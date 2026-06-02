"use client";

import * as React from "react";
import { Plus, Search, MessageSquareDashed, Instagram, Phone, MessageSquare } from "lucide-react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Button }              from "@/components/ui/button";
import { Input }               from "@/components/ui/input";
import { ConversationItem }    from "./conversation-item";
import { cn }                  from "@/lib/utils";
import type { InboxConversation } from "@/types/inbox";

type ChannelTab = "all" | "instagram" | "whatsapp" | "manual";

interface Props {
  orgSlug:       string;
  orgId:         string;
  conversations: InboxConversation[];
  onNewDm:       () => void;
  onDelete:      (id: string) => void;
}

const TABS: { id: ChannelTab; label: string; icon: React.ReactNode; provider?: string }[] = [
  { id: "all",       label: "All",       icon: <MessageSquare className="h-3 w-3" /> },
  { id: "instagram", label: "Instagram", icon: <Instagram     className="h-3 w-3" />, provider: "meta_instagram" },
  { id: "whatsapp",  label: "WhatsApp",  icon: <Phone         className="h-3 w-3" />, provider: "whatsapp_cloud" },
  { id: "manual",    label: "Manual",    icon: <MessageSquare className="h-3 w-3" />, provider: "manual" },
];

function tabCount(conversations: InboxConversation[], provider?: string): number {
  if (!provider) return conversations.length;
  return conversations.filter((c) => c.channel_provider === provider).length;
}

export function ConversationListPanel({ orgSlug, orgId, conversations, onNewDm, onDelete }: Props) {
  const pathname = usePathname();
  const [query,      setQuery]      = React.useState("");
  const [activeTab,  setActiveTab]  = React.useState<ChannelTab>("all");

  // Only show tabs that have conversations (or "all")
  const visibleTabs = TABS.filter((t) => t.id === "all" || tabCount(conversations, t.provider) > 0);

  const byChannel = activeTab === "all"
    ? conversations
    : conversations.filter((c) => {
        const tab = TABS.find((t) => t.id === activeTab);
        return c.channel_provider === tab?.provider;
      });

  const filtered = query.trim()
    ? byChannel.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.lead?.name?.toLowerCase().includes(q) ||
          c.lead?.external_id?.toLowerCase().includes(q) ||
          c.last_message_preview?.toLowerCase().includes(q)
        );
      })
    : byChannel;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-1)]">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-4">
        <span className="font-display text-sm font-semibold text-[var(--text)]">
          Inbox
          {conversations.length > 0 && (
            <span className="ml-2 text-[11px] font-normal text-[var(--text-3)]">
              {conversations.length}
            </span>
          )}
        </span>
        <Button size="icon" variant="ghost" onClick={onNewDm} aria-label="New DM">
          <Plus className="h-4 w-4 text-[var(--brand)]" />
        </Button>
      </div>

      {/* Channel tabs — only render if multiple channels have convs */}
      {visibleTabs.length > 1 && (
        <div className="flex items-center gap-0.5 px-3 pt-2 pb-1 shrink-0 overflow-x-auto scrollbar-none">
          {visibleTabs.map((tab) => {
            const count = tabCount(conversations, tab.provider);
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  active
                    ? "bg-[var(--brand)]/12 text-[var(--brand)] border border-[var(--brand)]/20"
                    : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--bg-2)]"
                )}
              >
                <span className={cn(active ? "text-[var(--brand)]" : "text-[var(--text-3)]")}>
                  {tab.icon}
                </span>
                {tab.label}
                {tab.id !== "all" && count > 0 && (
                  <span className={cn(
                    "text-[10px] rounded-full px-1.5 py-0 min-w-[18px] text-center",
                    active ? "bg-[var(--brand)]/20 text-[var(--brand)]" : "bg-[var(--bg-3)] text-[var(--text-3)]"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
          <Input
            placeholder="Search leads…"
            className="pl-8 h-8 text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
            <MessageSquareDashed className="h-8 w-8 text-[var(--text-3)]" />
            <p className="text-xs text-[var(--text-3)]">
              {query
                ? "No conversations match."
                : activeTab !== "all"
                ? `No ${TABS.find((t) => t.id === activeTab)?.label} conversations yet.`
                : "No DMs yet. Click + to send a test."}
            </p>
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          >
            {filtered.map((conv) => {
              const href   = `/org/${orgSlug}/inbox/${conv.id}`;
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <motion.div
                  key={conv.id}
                  variants={{
                    hidden: { opacity: 0, x: -8 },
                    show:   { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
                  }}
                >
                  <ConversationItem conv={conv} href={href} active={active} orgId={orgId} onDelete={onDelete} />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
