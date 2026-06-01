"use client";

import * as React from "react";
import { CalendarPlus, Loader2, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface ManualBookingLead { id: string; name: string | null; channel: string }

interface Props {
  orgId:  string;
  leads:  ManualBookingLead[];
  onDone: () => void;
}

export function ManualBookingSheet({ orgId, leads, onDone }: Props) {
  const [open,        setOpen]       = React.useState(false);
  const [leadId,      setLeadId]     = React.useState("");
  const [startsAt,    setStartsAt]   = React.useState("");
  const [meetingUrl,  setMeetingUrl] = React.useState("");
  const [notes,       setNotes]      = React.useState("");
  const [saving,      setSaving]     = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId || !startsAt) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/bookings/manual`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          lead_id:     leadId,
          starts_at:   new Date(startsAt).toISOString(),
          meeting_url: meetingUrl || undefined,
          notes:       notes      || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "Booking logged", description: "Confirmation message queued.", variant: "success" });
      setOpen(false);
      setLeadId(""); setStartsAt(""); setMeetingUrl(""); setNotes("");
      onDone();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        Log booking manually
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <form
            onSubmit={submit}
            className="relative z-10 w-full max-w-sm bg-[var(--bg-1)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[var(--text)]">Log booking manually</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-[var(--text-3)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Lead <span className="text-[var(--brand)]">*</span></label>
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} required className={inputCls}>
                  <option value="">Select a lead…</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>{l.name ?? "Unnamed"} ({l.channel})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Meeting date & time <span className="text-[var(--brand)]">*</span></label>
                <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required className={inputCls} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Meeting URL <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
                <input type="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://cal.com/…" className={inputCls} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Notes <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any context…" className={cn(inputCls, "resize-none")} />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-[var(--radius)] border border-[var(--border)] py-2.5 text-sm text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">Cancel</button>
              <button type="submit" disabled={saving || !leadId || !startsAt}
                className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] py-2.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Saving…" : "Log booking"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
