"use client";

import * as React from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Props {
  orgId:        string;
  initialUpiId: string;
}

export function UpiIdForm({ orgId, initialUpiId }: Props) {
  const [upiId,  setUpiId]  = React.useState(initialUpiId);
  const [saving, setSaving] = React.useState(false);
  const [saved,  setSaved]  = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/upi-id`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ upi_id: upiId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: "UPI ID saved", variant: "success" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--text-2)]">
          UPI ID <span className="text-[var(--text-3)] text-[11px]">(optional)</span>
        </label>
        <input
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          placeholder="yourname@okhdfc"
          pattern="[\w.\-]+@[\w]+"
          title="Format: yourname@bankname (e.g. rahul@okhdfc)"
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
        />
        <p className="text-[11px] text-[var(--text-3)]">e.g. yourname@okhdfc, +91XXXXXXXXXX@ybl</p>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
        {saving ? "Saving…" : saved ? "Saved!" : "Save UPI ID"}
      </button>
    </form>
  );
}
