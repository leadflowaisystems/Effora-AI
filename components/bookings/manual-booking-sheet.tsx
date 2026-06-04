"use client";

import * as React from "react";
import { CalendarPlus, Loader2, X, Users } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface ManualBookingLead  { id: string; name: string | null; channel: string }
export interface ManualBookingGroup { id: string; name: string; tag: string; member_count: number }

interface Props {
  orgId:  string;
  leads:  ManualBookingLead[];
  groups?: ManualBookingGroup[];
  onDone: () => void;
}

export function ManualBookingSheet({ orgId, leads, groups = [], onDone }: Props) {
  const [open,         setOpen]        = React.useState(false);
  const [recipientVal,   setRecipientVal]   = React.useState("");
  const [startsAt,       setStartsAt]       = React.useState("");
  const [meetingUrl,     setMeetingUrl]     = React.useState("");
  const [notes,          setNotes]          = React.useState("");
  const [customMessage,  setCustomMessage]  = React.useState("");
  const [saving,         setSaving]         = React.useState(false);

  const selectedGroup = recipientVal.startsWith("group:") ? groups.find((g) => g.id === recipientVal.slice(6)) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipientVal || !startsAt) return;
    setSaving(true);
    try {
      if (selectedGroup) {
        const res = await fetch(`/api/orgs/${orgId}/bookings/group`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            group_id:       selectedGroup.id,
            starts_at:      new Date(startsAt).toISOString(),
            meeting_url:    meetingUrl     || undefined,
            notes:          notes          || undefined,
            custom_message: customMessage  || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        toast({ title: `${data.count} bookings created`, description: `One per member of "${selectedGroup.name}".`, variant: "success" });
      } else {
        const leadId = recipientVal.replace("lead:", "");
        const res = await fetch(`/api/orgs/${orgId}/bookings/manual`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            lead_id:        leadId,
            starts_at:      new Date(startsAt).toISOString(),
            meeting_url:    meetingUrl     || undefined,
            notes:          notes          || undefined,
            custom_message: customMessage  || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        toast({ title: "Booking logged", description: "Confirmation message queued.", variant: "success" });
      }
      setOpen(false);
      setRecipientVal(""); setStartsAt(""); setMeetingUrl(""); setNotes(""); setCustomMessage("");
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
            className="relative z-10 w-full max-w-sm bg-[var(--bg-1)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[var(--text)]">Log booking manually</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-[var(--text-3)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Lead or Group <span className="text-[var(--brand)]">*</span></label>
                <select value={recipientVal} onChange={(e) => setRecipientVal(e.target.value)} required className={inputCls}>
                  <option value="">Select lead or group…</option>
                  {leads.length > 0 && (
                    <optgroup label="Individual leads">
                      {leads.map((l) => <option key={l.id} value={`lead:${l.id}`}>{l.name ?? "Unnamed"} ({l.channel})</option>)}
                    </optgroup>
                  )}
                  {groups.length > 0 && (
                    <optgroup label="Groups (creates one booking per member)">
                      {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>Group: {g.name} · {g.member_count} members</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              {selectedGroup && (
                <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                  <Users className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-400/90 leading-relaxed">
                    Creates <strong>{selectedGroup.member_count}</strong> individual booking confirmations — one per member. Each gets a class confirmation message.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Meeting date & time <span className="text-[var(--brand)]">*</span></label>
                <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required className={inputCls} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Meeting URL <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
                <input
                  type="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="Leave blank to use Cal.com link, or paste Zoom/Meet/custom URL — this will be sent to lead instead"
                  className={inputCls}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Notes <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal notes (not sent to lead)" className={cn(inputCls, "resize-none")} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Custom message <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
                <textarea
                  value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={3}
                  placeholder={"Leave blank to use AI-generated message, or type your own — it will be sent instead.\nVariables: {{name}} {{first_name}} {{date}} {{time}} {{link}}"}
                  className={cn(inputCls, "resize-none")}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-[var(--radius)] border border-[var(--border)] py-2.5 text-sm text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">Cancel</button>
              <button type="submit" disabled={saving || !recipientVal || !startsAt}
                className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] py-2.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Saving…" : selectedGroup ? `Create ${selectedGroup.member_count} bookings` : "Log booking"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
