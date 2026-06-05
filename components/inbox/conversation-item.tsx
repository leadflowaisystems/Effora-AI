"use client";

import * as React from "react";
import Link from "next/link";
import { Instagram, Phone, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/time";
import type { InboxConversation } from "@/types/inbox";

interface Props {
  conv:     InboxConversation;
  href:     string;
  active:   boolean;
  orgId:    string;
  onDelete: (id: string) => void;
}

const STAGE_COLORS: Record<string, { avatar: string; badge: string }> = {
  hot:        { avatar: "bg-[var(--brand)] text-[#0A0A0C] shadow-jade",   badge: "hot"  },
  warm:       { avatar: "bg-[var(--warn)]  text-[#0A0A0C]",               badge: "warm" },
  cold:       { avatar: "bg-[var(--bg-3)]  text-[var(--text-3)]",         badge: "cold" },
  qualified:  { avatar: "bg-[var(--brand-deep)] text-white",              badge: "brand" },
};

function stageStyle(stage: string) {
  return STAGE_COLORS[stage] ?? STAGE_COLORS.cold;
}

function initials(name: string | null, fallback: string): string {
  const s = name ?? fallback;
  return s
    .split(/[\s_@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function ChannelIcon({ provider }: { provider: string }) {
  if (provider === "meta_instagram") return (
    <span className="flex items-center gap-0.5 rounded px-1 py-0.5 bg-pink-500/10 text-pink-400 text-[10px] font-medium">
      <Instagram className="h-2.5 w-2.5" /> IG
    </span>
  );
  if (provider === "whatsapp_cloud") return (
    <span className="flex items-center gap-0.5 rounded px-1 py-0.5 bg-[var(--brand)]/10 text-[var(--brand)] text-[10px] font-medium">
      <Phone className="h-2.5 w-2.5" /> WA
    </span>
  );
  return null;
}

export function ConversationItem({ conv, href, active, orgId, onDelete }: Props) {
  const lead    = conv.lead;
  const colors  = stageStyle(lead?.stage ?? "cold");
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    if (!window.confirm("Delete this conversation? It will be hidden from your inbox.")) return;
    setDeleting(true);
    try {
      await fetch(`/api/orgs/${orgId}/conversations/${conv.id}`, { method: "DELETE" });
      onDelete(conv.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="relative group">
    <Link
      href={href}
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-sm)] px-3 py-3 transition-colors duration-[120ms]",
        active
          ? "bg-[var(--bg-3)] ring-1 ring-[var(--border-strong)]"
          : "hover:bg-[var(--bg-2)]"
      )}
    >
      {/* Avatar */}
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold mt-0.5",
        colors.avatar
      )}>
        {lead?.avatar_url
          ? <img src={lead.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
          : initials(lead?.name ?? null, lead?.external_id ?? "?")}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "text-sm font-medium truncate",
            active ? "text-[var(--text)]" : "text-[var(--text-2)]"
          )}>
            {(() => {
              const name  = lead?.name;
              const rawId = lead?.external_id?.replace(/^ig_/, "") ?? "";
              if (!name || name === rawId || /^\d{10,}$/.test(name)) {
                return rawId.length > 6 ? `IG …${rawId.slice(-6)}` : (rawId || "Unknown");
              }
              return name;
            })()}
          </span>
          <span className="text-[11px] text-[var(--text-3)] shrink-0">
            {timeAgo(conv.last_message_at)}
          </span>
        </div>

        <p className="mt-0.5 text-xs text-[var(--text-3)] truncate leading-relaxed">
          {conv.last_message_preview ?? "No messages yet"}
        </p>

        {/* Badges row */}
        <div className="mt-1.5 flex items-center gap-1.5">
          {/* Channel icon */}
          <span className="flex items-center gap-0.5 text-[var(--text-3)]">
            <ChannelIcon provider={conv.channel_provider} />
          </span>
          {lead?.stage && (
            <Badge variant={colors.badge as Parameters<typeof Badge>[0]["variant"]} className="text-[10px] px-1.5 py-0">
              {lead.stage.charAt(0).toUpperCase() + lead.stage.slice(1)}
            </Badge>
          )}
          {lead?.score !== undefined && lead.score > 0 && (
            <span className="text-[10px] text-[var(--text-3)]">{lead.score}/100</span>
          )}
          {conv.hasPendingDraft && (
            <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-[var(--brand)] shadow-jade shrink-0" />
          )}
        </div>
      </div>
    </Link>
    {/* Delete button — appears on hover */}
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      aria-label="Delete conversation"
      className={cn(
        "absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded",
        "text-[var(--text-3)] hover:text-red-400 hover:bg-red-500/10 transition-colors",
        "opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
      )}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
    </div>
  );
}
