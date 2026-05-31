"use client";

import * as React from "react";
import { Sparkles, Check, Pencil, X, Loader2, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button }   from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge }    from "@/components/ui/badge";
import { cn }       from "@/lib/utils";
import type { InboxDraft } from "@/types/inbox";

interface Props {
  draft:        InboxDraft;
  orgId:        string;
  convId:       string;
  onDone:       (newMsg?: { id: string; content: string; sent_at: string; direction: "outbound" }) => void;
}

export function AiDraftCard({ draft, orgId, convId, onDone }: Props) {
  const [mode,    setMode]    = React.useState<"view" | "edit">("view");
  const [edited,  setEdited]  = React.useState(draft.content);
  const [loading, setLoading] = React.useState<"approve" | "edit" | "reject" | null>(null);

  async function patchDraft(action: "approve" | "edit" | "reject", editedContent?: string) {
    setLoading(action);
    try {
      const res = await fetch(`/api/orgs/${orgId}/conversations/${convId}/draft`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ draftId: draft.id, action, editedContent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");

      onDone(json.message ? { ...json.message, direction: "outbound" as const } : undefined);
    } catch (err) {
      console.error("[draft]", err);
    } finally {
      setLoading(null);
    }
  }

  const busy = loading !== null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{    opacity: 0, y: 12 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--bg-2)]",
          "shadow-[0_0_16px_var(--brand-glow)]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--brand)]/20">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[var(--brand)]" />
            <span className="text-xs font-semibold text-[var(--brand)]">AI Draft</span>
            <Badge variant="muted" className="text-[10px] px-1.5 py-0">pending</Badge>
          </div>
          <span className="text-[10px] text-[var(--text-3)] font-mono truncate max-w-[140px]">
            {process.env.NEXT_PUBLIC_LLM_MODEL_SMART ?? "llama-3.3-70b"}
          </span>
        </div>

        {/* Content */}
        <div className="px-4 py-3">
          {mode === "view" ? (
            <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">
              {draft.content}
            </p>
          ) : (
            <Textarea
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              className="min-h-[80px] text-sm border-[var(--brand)]/40 bg-[var(--bg-1)]"
              autoFocus
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 pb-3 pt-1">
          {mode === "view" ? (
            <>
              <Button
                size="sm" variant="primary"
                disabled={busy}
                onClick={() => patchDraft("approve")}
                className="gap-1.5"
              >
                {loading === "approve"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check   className="h-3.5 w-3.5" />}
                Approve & Send
              </Button>
              <Button
                size="sm" variant="secondary"
                disabled={busy}
                onClick={() => setMode("edit")}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm" variant="ghost"
                disabled={busy}
                onClick={() => patchDraft("reject")}
                className="ml-auto gap-1.5 text-[var(--text-3)] hover:text-[var(--danger)]"
              >
                {loading === "reject"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <X       className="h-3.5 w-3.5" />}
                Dismiss
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm" variant="primary"
                disabled={busy || !edited.trim()}
                onClick={() => patchDraft("edit", edited)}
                className="gap-1.5"
              >
                {loading === "edit"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send    className="h-3.5 w-3.5" />}
                Send Edited
              </Button>
              <Button
                size="sm" variant="ghost"
                disabled={busy}
                onClick={() => { setMode("view"); setEdited(draft.content); }}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
