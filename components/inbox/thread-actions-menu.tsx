"use client";

/**
 * ThreadActionsMenu — the "⋯" menu in an inbox thread header.
 *
 * Two destructive actions, deliberately very different in weight:
 *
 *   Remove from inbox  — archives the CONVERSATION only. One confirm. The lead
 *                        stays in the CRM, and if that person messages again the
 *                        webhook reopens this same thread.
 *   Delete lead        — removes the person entirely. TWO-step confirm, second
 *                        step requires typing DELETE, and both steps name the
 *                        lead so you cannot nuke the wrong one by muscle memory.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Archive, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { DeleteLeadDialog } from "@/components/leads/delete-lead-dialog";

interface Props {
  orgId:     string;
  orgSlug:   string;
  convId:    string;
  leadId:    string | null;
  leadName:  string | null;
}

type Mode = null | "archive" | "delete";

export function ThreadActionsMenu({ orgId, orgSlug, convId, leadId, leadName }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>(null);
  const [busy, setBusy] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const displayName = leadName?.trim() || "this contact";

  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function reset() {
    setMode(null); setBusy(false);
  }

  async function doArchive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/conversations/${convId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      // Tell the inbox list to drop this thread without a refetch.
      window.dispatchEvent(new CustomEvent("conversation-removed", { detail: { convId } }));
      toast({ title: "Removed from inbox", description: `${displayName} is still in your CRM.` });
      reset();
      router.push(`/org/${orgSlug}/inbox`);
    } catch (err) {
      setBusy(false);
      toast({
        title: "Could not remove",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Conversation options"
          onClick={() => setOpen((v) => !v)}
        >
          <MoreVertical className="h-4 w-4 text-[var(--text-3)]" />
        </Button>

        {open && (
          <div className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] shadow-lg">
            <button
              type="button"
              onClick={() => { setOpen(false); setMode("archive"); }}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-3)]"
            >
              <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
              <span>
                Remove from inbox
                <span className="block text-[11px] text-[var(--text-3)]">Keeps the lead in your CRM</span>
              </span>
            </button>
            {leadId && (
              <button
                type="button"
                onClick={() => { setOpen(false); setMode("delete"); }}
                className="flex w-full items-start gap-2.5 border-t border-[var(--border)] px-3 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Delete lead
                  <span className="block text-[11px] text-red-400/70">Removes them everywhere</span>
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Archive confirm ─────────────────────────────────────── */}
      {mode === "archive" && (
        <Modal onCancel={reset}>
          <h2 className="font-display text-lg font-semibold text-[var(--text)]">
            Remove {displayName} from your inbox?
          </h2>
          <p className="mt-2 text-sm text-[var(--text-3)]">
            This conversation and its messages will be hidden from the inbox.{" "}
            <strong className="text-[var(--text-2)]">{displayName} stays in your CRM</strong>, along
            with their bookings and payments.
          </p>
          <p className="mt-2 text-sm text-[var(--text-3)]">
            If they message you again, the conversation comes straight back with its history intact.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={reset} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={doArchive} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Removing…</> : "Remove from inbox"}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm — shared two-step dialog ─────────────── */}
      {/* Same component the CRM lead view uses, so the wording can never drift. */}
      {mode === "delete" && leadId && (
        <DeleteLeadDialog
          orgId={orgId}
          leadId={leadId}
          leadName={leadName}
          onClose={reset}
          onDeleted={() => {
            window.dispatchEvent(new CustomEvent("conversation-removed", { detail: { convId } }));
            reset();
            router.push(`/org/${orgSlug}/inbox`);
          }}
        />
      )}
    </>
  );
}

function Modal({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-5 shadow-xl">
        {children}
      </div>
    </div>
  );
}
