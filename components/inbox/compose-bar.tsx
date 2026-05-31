"use client";

import * as React from "react";
import { Send, Loader2 } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn }       from "@/lib/utils";
import type { InboxMessage } from "@/types/inbox";

interface Props {
  orgId:   string;
  convId:  string;
  onSent:  (msg: InboxMessage) => void;
  disabled?: boolean;
}

export function ComposeBar({ orgId, convId, onSent, disabled }: Props) {
  const [text,    setText]    = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  async function send() {
    const content = text.trim();
    if (!content || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/conversations/${convId}/reply`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send failed");

      setText("");
      onSent({
        id:        json.message.id,
        direction: "outbound",
        content,
        sent_at:   json.message.sent_at,
        metadata:  { source: "manual" },
      });

      // Re-focus after send
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (err) {
      console.error("[compose]", err);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className={cn(
      "flex shrink-0 items-end gap-2 border-t border-[var(--border)] bg-[var(--bg-1)] px-4 py-3",
      disabled && "opacity-50 pointer-events-none"
    )}>
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Reply… (Ctrl+Enter to send)"
        className="flex-1 min-h-[40px] max-h-[140px] resize-none bg-[var(--bg-2)] text-sm"
        rows={1}
        style={{ height: "auto" }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = Math.min(el.scrollHeight, 140) + "px";
        }}
      />
      <Button
        size="icon"
        variant="primary"
        disabled={!text.trim() || loading}
        onClick={send}
        aria-label="Send"
        className="shrink-0 mb-0.5"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Send    className="h-4 w-4" />}
      </Button>
    </div>
  );
}
