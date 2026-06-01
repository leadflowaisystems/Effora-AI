"use client";

import * as React from "react";
import { Plus, Search, MessageSquareDashed } from "lucide-react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Button }              from "@/components/ui/button";
import { Input }               from "@/components/ui/input";
import { ConversationItem }    from "./conversation-item";
import type { InboxConversation } from "@/types/inbox";

interface Props {
  orgSlug:       string;
  conversations: InboxConversation[];
  onNewDm:       () => void;
}

export function ConversationListPanel({ orgSlug, conversations, onNewDm }: Props) {
  const pathname = usePathname();
  const [query,  setQuery]  = React.useState("");

  const filtered = query.trim()
    ? conversations.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.lead?.name?.toLowerCase().includes(q) ||
          c.lead?.external_id?.toLowerCase().includes(q) ||
          c.last_message_preview?.toLowerCase().includes(q)
        );
      })
    : conversations;

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
              {query ? "No conversations match." : "No DMs yet. Click + to send a test."}
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
                  <ConversationItem conv={conv} href={href} active={active} />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
