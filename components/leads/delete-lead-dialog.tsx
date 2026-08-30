"use client";

/**
 * DeleteLeadDialog — the two-step confirmation for full lead removal.
 *
 * Shared by the inbox thread menu and the CRM lead view so the wording a user
 * sees is identical wherever they trigger it. Both steps name the lead, and the
 * second requires typing DELETE, so this cannot be cleared by muscle memory.
 */

import * as React from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  orgId:     string;
  leadId:    string;
  leadName:  string | null;
  onClose:   () => void;
  /** Called after a successful delete, before any navigation. */
  onDeleted?: (removed: { sequences?: number; conversations?: number; bookings?: number }) => void;
}

export function DeleteLeadDialog({ orgId, leadId, leadName, onClose, onDeleted }: Props) {
  const { toast } = useToast();
  const [step,    setStep]    = React.useState(1);
  const [confirm, setConfirm] = React.useState("");
  const [busy,    setBusy]    = React.useState(false);

  const displayName = leadName?.trim() || "this contact";

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !busy) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function doDelete() {
    setBusy(true);
    try {
      const res  = await fetch(`/api/orgs/${orgId}/leads/${leadId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const removed = json.removed ?? {};
      toast({
        title:       `${displayName} deleted`,
        description: `Stopped ${removed.sequences ?? 0} follow-up sequence(s). Payment records were kept for your accounts.`,
      });
      onDeleted?.(removed);
    } catch (err) {
      setBusy(false);
      toast({
        title:       "Could not delete",
        description: err instanceof Error ? err.message : "Please try again.",
        variant:     "destructive",
      });
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-5 shadow-xl">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-[var(--text)]">
              {step === 1 ? `Delete ${displayName}?` : `Last check — delete ${displayName}?`}
            </h2>

            {step === 1 ? (
              <>
                <p className="mt-2 text-sm text-[var(--text-3)]">This permanently removes:</p>
                <ul className="mt-2 space-y-1 text-sm text-[var(--text-2)]">
                  <li>• Their lead record and CRM history</li>
                  <li>• All conversations and messages</li>
                  <li>• All bookings</li>
                  <li>• Any follow-up sequence still running for them</li>
                </ul>
                <p className="mt-3 text-sm text-[var(--text-3)]">
                  <strong className="text-[var(--text-2)]">Payments are kept</strong> so your
                  revenue and accounts stay correct — but they will no longer show a name.
                </p>
                <p className="mt-2 text-sm text-red-400">This cannot be undone.</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-[var(--text-3)]">
                  Type <strong className="text-[var(--text)]">DELETE</strong> to confirm you want to
                  remove <strong className="text-[var(--text)]">{displayName}</strong>.
                </p>
                <input
                  autoFocus
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="DELETE"
                  className={cn(
                    "mt-3 w-full rounded-[var(--radius-sm)] border bg-[var(--bg-3)] px-3 py-2 text-sm",
                    "text-[var(--text)] outline-none transition-colors",
                    confirm && confirm !== "DELETE"
                      ? "border-red-500/40"
                      : "border-[var(--border)] focus:border-[var(--brand)]/50",
                  )}
                />
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          {step === 1 ? (
            <Button variant="destructive" onClick={() => setStep(2)}>Continue</Button>
          ) : (
            <Button
              variant="destructive"
              onClick={doDelete}
              disabled={busy || confirm !== "DELETE"}
            >
              {busy
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
                : `Delete ${displayName}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
