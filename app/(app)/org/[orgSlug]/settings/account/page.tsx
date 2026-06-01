"use client";

/**
 * /org/[slug]/settings/account — Account management: export data, delete account.
 */

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, Trash2, AlertTriangle, RotateCcw } from "lucide-react";

export default function AccountSettingsPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;

  const [exporting, setExporting]   = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirm, setConfirm]       = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [deleteScheduled, setDeleteScheduled] = useState<string | null>(null);

  async function startExport() {
    setExporting(true);
    setError(null);
    const res = await fetch(`/api/orgs/${orgSlug}/export`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setExporting(false);
    if (!res.ok) setError(data.error ?? "Export failed. Try again.");
    else alert("Export requested — you'll receive a download link by email within a few minutes.");
  }

  async function scheduleDelete() {
    setDeleting(true);
    setError(null);
    // First look up orgId from slug
    const orgRes = await fetch(`/api/orgs/by-slug/${orgSlug}`);
    const orgData = await orgRes.json().catch(() => ({}));
    if (!orgRes.ok) { setDeleting(false); setError("Could not find org."); return; }

    const res = await fetch(`/api/orgs/${orgData.id}/account/delete`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) { setError(data.error ?? "Could not schedule deletion."); return; }
    setDeleteScheduled(data.scheduled_delete_at);
    setShowDelete(false);
    setConfirm("");
  }

  async function cancelDelete() {
    setCancelling(true);
    const orgRes = await fetch(`/api/orgs/by-slug/${orgSlug}`);
    const orgData = await orgRes.json().catch(() => ({}));
    if (!orgRes.ok) { setCancelling(false); return; }

    await fetch(`/api/orgs/${orgData.id}/account/delete`, { method: "DELETE" });
    setCancelling(false);
    setDeleteScheduled(null);
  }

  return (
    <div className="space-y-7 max-w-lg">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Account</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Export your data or permanently delete this workspace.
        </p>
      </div>

      {/* Data export */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Download className="h-5 w-5 mt-0.5 text-[var(--text-3)]" />
          <div className="flex-1">
            <p className="font-semibold text-[var(--text)]">Export your data</p>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              Download all your leads, conversations, bookings, payments, and settings as a ZIP archive.
              You&apos;ll receive a download link by email.
            </p>
          </div>
        </div>
        <button
          onClick={startExport}
          disabled={exporting}
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] disabled:opacity-50 transition-colors"
        >
          {exporting ? "Preparing export…" : "Request data export"}
        </button>
      </div>

      {/* Deletion countdown if scheduled */}
      {deleteScheduled && (
        <div className="rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/8 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 text-amber-400 shrink-0" />
            <div>
              <p className="font-semibold text-[var(--text)]">Deletion scheduled</p>
              <p className="text-xs text-[var(--text-3)] mt-0.5">
                This workspace will be permanently deleted on{" "}
                <strong>{new Date(deleteScheduled).toDateString()}</strong>.
                Log back in at any time before that date to cancel.
              </p>
            </div>
          </div>
          <button
            onClick={cancelDelete}
            disabled={cancelling}
            className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-1)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-2)] disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            {cancelling ? "Cancelling…" : "Cancel deletion"}
          </button>
        </div>
      )}

      {/* Delete zone */}
      {!deleteScheduled && (
        <div className="rounded-[var(--radius-lg)] border border-red-500/20 bg-[var(--bg-1)] p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Trash2 className="h-5 w-5 mt-0.5 text-red-400 shrink-0" />
            <div>
              <p className="font-semibold text-[var(--text)]">Delete workspace</p>
              <p className="text-xs text-[var(--text-3)] mt-0.5">
                Permanently delete this workspace and all data after a 30-day grace period.
                This action cannot be undone.
              </p>
            </div>
          </div>

          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="rounded-[var(--radius)] border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/8 transition-colors"
            >
              Delete workspace…
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-2)]">
                Type <strong>DELETE</strong> to confirm:
              </p>
              <input
                type="text"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={scheduleDelete}
                  disabled={deleting || confirm !== "DELETE"}
                  className="flex-1 rounded-[var(--radius)] bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Scheduling…" : "Confirm deletion"}
                </button>
                <button
                  onClick={() => { setShowDelete(false); setConfirm(""); }}
                  className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-3)] hover:bg-[var(--bg-2)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
