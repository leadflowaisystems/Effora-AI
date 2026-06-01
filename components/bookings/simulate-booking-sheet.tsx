"use client";

import { useState } from "react";
import { Beaker, CalendarPlus, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types ────────────────────────────────────────────────────
export interface SimulateLead {
  id:      string;
  name:    string | null;
  channel: string;
}

interface Props {
  orgId:  string;
  leads:  SimulateLead[];
  /** Called after a booking is successfully created so the list can refresh. */
  onDone: () => void;
}

// ── Helpers ──────────────────────────────────────────────────
/** Returns a datetime-local string 2 minutes from now (rounded to seconds). */
function defaultStartsAt(): string {
  const d = new Date(Date.now() + 2 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// ── Component ────────────────────────────────────────────────
export function SimulateBookingSheet({ orgId, leads, onDone }: Props) {
  const [open,       setOpen]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState(false);

  // Form state
  const [leadId,         setLeadId]         = useState(() => leads[0]?.id ?? "");
  const [startsAt,       setStartsAt]       = useState(defaultStartsAt);
  const [attendeeName,   setAttendeeName]   = useState(() => leads[0]?.name ?? "");
  const [attendeeEmail,  setAttendeeEmail]  = useState("");

  function handleLeadChange(id: string) {
    setLeadId(id);
    const l = leads.find((x) => x.id === id);
    setAttendeeName(l?.name ?? "");
  }

  function handleOpenChange(v: boolean) {
    if (v) {
      // Reset form on open
      const first = leads[0];
      setLeadId(first?.id ?? "");
      setStartsAt(defaultStartsAt());
      setAttendeeName(first?.name ?? "");
      setAttendeeEmail("");
      setError(null);
      setSuccess(false);
    }
    setOpen(v);
  }

  async function handleSubmit() {
    if (!leadId) { setError("Please select a lead."); return; }
    setSubmitting(true);
    setError(null);

    try {
      const isoStartsAt = new Date(startsAt).toISOString();
      const res = await fetch(`/api/orgs/${orgId}/bookings/simulate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          leadId,
          startsAt:      isoStartsAt,
          attendeeName:  attendeeName.trim() || undefined,
          attendeeEmail: attendeeEmail.trim() || undefined,
        }),
      });

      // Always try to parse JSON; catch malformed/empty body gracefully
      const json = await res.json().catch(() => ({})) as { error?: string; ok?: boolean };
      if (!res.ok) throw new Error(json.error ?? `Server error (${res.status})`);
      if (!json.ok && res.status !== 200) throw new Error("Simulation failed");

      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        onDone();
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {/* Trigger — amber dashed badge style so it's clearly dev-only */}
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:border-amber-500/60 hover:bg-amber-500/10 hover:text-amber-300"
      >
        <Beaker className="h-3.5 w-3.5" />
        Simulate booking
      </button>

      <SheetContent side="right" className="flex flex-col p-0 w-full sm:max-w-md">
        {/* Header */}
        <SheetHeader className="shrink-0 border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-amber-500/15 border border-amber-500/25">
              <Beaker className="h-4.5 w-4.5 text-amber-400" />
            </div>
            <div>
              <SheetTitle>Simulate a booking</SheetTitle>
              <SheetDescription>
                Dev-only · emits <code className="text-[11px] bg-[var(--bg-3)] px-1 py-0.5 rounded">booking.created</code> so reminders fire identically.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Lead picker */}
          <div className="space-y-1.5">
            <Label>Lead / attendee <span className="text-[var(--brand)] font-medium">*</span></Label>
            {leads.length === 0 ? (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] p-4 text-xs text-[var(--text-3)] text-center">
                No leads yet — send a test DM first from the Inbox.
              </div>
            ) : (
              <Select value={leadId} onValueChange={handleLeadChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a lead…" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="font-medium">{l.name ?? "Unnamed"}</span>
                      <span className="ml-1.5 text-[var(--text-3)] text-[11px]">({l.channel})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Meeting time */}
          <div className="space-y-1.5">
            <Label htmlFor="sim-starts-at">Meeting time <span className="text-[var(--brand)] font-medium">*</span></Label>
            <Input
              id="sim-starts-at"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="[color-scheme:dark]"
            />
            <p className="text-[11px] text-[var(--text-3)]">
              Reminders fire relative to this time.
              Set <code className="bg-[var(--bg-3)] px-1 rounded">TEST_REMINDER_24H_MS</code> in{" "}
              <code className="bg-[var(--bg-3)] px-1 rounded">.env.local</code> for instant firing.
            </p>
          </div>

          {/* Attendee name */}
          <div className="space-y-1.5">
            <Label htmlFor="sim-attendee-name">
              Attendee name <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
            </Label>
            <Input
              id="sim-attendee-name"
              value={attendeeName}
              onChange={(e) => setAttendeeName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          {/* Attendee email */}
          <div className="space-y-1.5">
            <Label htmlFor="sim-attendee-email">
              Attendee email{" "}
              <span className="text-[11px] text-[var(--text-3)] font-normal">(optional)</span>
            </Label>
            <Input
              id="sim-attendee-email"
              type="email"
              value={attendeeEmail}
              onChange={(e) => setAttendeeEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>

          {/* Feedback */}
          {error && (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          )}
          {success && (
            <p className="text-sm text-[var(--brand)]">
              Booking created — Inngest event fired!
            </p>
          )}
        </div>

        {/* Footer */}
        <SheetFooter className="shrink-0 px-6 py-4">
          <Button
            variant="primary"
            className="w-full gap-2"
            onClick={handleSubmit}
            disabled={submitting || leads.length === 0 || success}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating booking…
              </>
            ) : success ? (
              "Done!"
            ) : (
              <>
                <CalendarPlus className="h-4 w-4" />
                Create simulated booking
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
