"use client";

import { useState } from "react";
import { Beaker, Loader2, IndianRupee } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface SimulateLead {
  id:      string;
  name:    string | null;
  channel: string;
}

type Mode = "create" | "capture" | "unpaid" | "revival";

interface PendingPayment {
  id:         string;
  amount_inr: number;
  lead_name:  string | null;
}

interface Props {
  orgId:           string;
  leads:           SimulateLead[];
  pendingPayments: PendingPayment[];
  onDone:          () => void;
}

const MODE_LABELS: Record<Mode, string> = {
  create:  "Create payment link",
  capture: "Mark as paid",
  unpaid:  "Start dunning",
  revival: "Trigger ghost revival",
};

export function SimulatePaymentSheet({ orgId, leads, pendingPayments, onDone }: Props) {
  const [open,       setOpen]       = useState(false);
  const [mode,       setMode]       = useState<Mode>("create");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);

  // Create fields
  const [leadId,      setLeadId]      = useState(leads[0]?.id ?? "");
  const [amountInr,   setAmountInr]   = useState("5000");
  const [description, setDescription] = useState("Coaching program");

  // Capture / unpaid fields
  const [paymentId, setPaymentId] = useState(pendingPayments[0]?.id ?? "");

  // Revival fields
  const [reviveLeadId, setReviveLeadId] = useState(leads[0]?.id ?? "");

  function handleOpen(v: boolean) {
    if (v) {
      setError(null);
      setSuccess(null);
      setMode("create");
      setLeadId(leads[0]?.id ?? "");
      setAmountInr("5000");
      setDescription("Coaching program");
      setPaymentId(pendingPayments[0]?.id ?? "");
      setReviveLeadId(leads[0]?.id ?? "");
    }
    setOpen(v);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === "create") {
        const amount = parseFloat(amountInr);
        if (!leadId)     throw new Error("Pick a lead");
        if (isNaN(amount) || amount <= 0) throw new Error("Enter a valid amount");

        const res = await fetch(`/api/orgs/${orgId}/payments/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", leadId, amountInr: amount, description }),
        });
        const j = await res.json().catch(() => ({})) as { error?: string; step?: string; ok?: boolean };
        if (!res.ok) throw new Error(j.step ? `[${j.step}] ${j.error ?? "Failed"}` : j.error ?? "Failed");
        setSuccess("Payment link created — payment.created event fired.");
        onDone();

      } else if (mode === "capture" || mode === "unpaid") {
        if (!paymentId) throw new Error("Pick a pending payment");
        const res = await fetch(`/api/orgs/${orgId}/payments/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: mode, paymentId }),
        });
        const j = await res.json().catch(() => ({})) as { error?: string; step?: string; ok?: boolean };
        if (!res.ok) throw new Error(j.step ? `[${j.step}] ${j.error ?? "Failed"}` : j.error ?? "Failed");
        setSuccess(
          mode === "capture"
            ? "Payment marked paid — lead stage set to won."
            : "payment.unpaid fired — dunning sequence will start."
        );
        onDone();

      } else if (mode === "revival") {
        if (!reviveLeadId) throw new Error("Pick a lead");
        const res = await fetch(`/api/orgs/${orgId}/leads/${reviveLeadId}/revive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const j = await res.json().catch(() => ({})) as { error?: string; step?: string; ok?: boolean };
        if (!res.ok) throw new Error(j.step ? `[${j.step}] ${j.error ?? "Failed"}` : j.error ?? "Failed");
        setSuccess("Ghost revival sequence started — lead.ghost_revival event fired.");
        onDone();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <button
        type="button"
        onClick={() => handleOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:border-amber-500/60 hover:bg-amber-500/10 hover:text-amber-300"
      >
        <Beaker className="h-3.5 w-3.5" />
        Simulate
      </button>

      <SheetContent side="right" className="flex flex-col p-0 w-full sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-amber-500/15 border border-amber-500/25">
              <Beaker className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <SheetTitle>Simulate payment events</SheetTitle>
              <SheetDescription>
                Dev-only · fires the same Inngest events as real Razorpay webhooks.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Mode selector */}
          <div className="space-y-1.5">
            <Label>What do you want to simulate?</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["create", "capture", "unpaid", "revival"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); setSuccess(null); }}
                  className={[
                    "rounded-[var(--radius-sm)] border px-3 py-2 text-left text-xs font-medium transition-colors",
                    mode === m
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                      : "border-[var(--border)] bg-[var(--bg-3)] text-[var(--text-2)] hover:border-[var(--border-strong)]",
                  ].join(" ")}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* ── CREATE ── */}
          {mode === "create" && (
            <>
              <div className="space-y-1.5">
                <Label>Lead <span className="text-[var(--brand)] font-medium">*</span></Label>
                {leads.length === 0 ? (
                  <p className="text-xs text-[var(--text-3)]">No leads yet — send a test DM first.</p>
                ) : (
                  <Select value={leadId} onValueChange={setLeadId}>
                    <SelectTrigger><SelectValue placeholder="Pick a lead…" /></SelectTrigger>
                    <SelectContent>
                      {leads.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name ?? "Unnamed"} <span className="text-[var(--text-3)]">({l.channel})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-amount">Amount (₹) <span className="text-[var(--brand)] font-medium">*</span></Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-3)]" />
                  <Input
                    id="sim-amount"
                    type="number"
                    min="1"
                    value={amountInr}
                    onChange={(e) => setAmountInr(e.target.value)}
                    className="pl-8 font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-desc">
                  Description <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
                </Label>
                <Input
                  id="sim-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Coaching program"
                />
              </div>
              <p className="text-[11px] text-[var(--text-3)]">
                Creates a pending payment row + fake link, then emits{" "}
                <code className="bg-[var(--bg-3)] px-1 rounded">payment.created</code>.
                Set <code className="bg-[var(--bg-3)] px-1 rounded">TEST_PAYMENT_UNPAID_MS</code> for fast timeout.
              </p>
            </>
          )}

          {/* ── CAPTURE / UNPAID ── */}
          {(mode === "capture" || mode === "unpaid") && (
            <>
              <div className="space-y-1.5">
                <Label>Pending payment</Label>
                {pendingPayments.length === 0 ? (
                  <p className="text-xs text-[var(--text-3)]">No pending payments — create one first.</p>
                ) : (
                  <Select value={paymentId} onValueChange={setPaymentId}>
                    <SelectTrigger><SelectValue placeholder="Pick a payment…" /></SelectTrigger>
                    <SelectContent>
                      {pendingPayments.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.lead_name ?? "Unknown"} — ₹{p.amount_inr.toLocaleString("en-IN")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-[11px] text-[var(--text-3)]">
                {mode === "capture"
                  ? "Marks the payment as paid and sets lead stage to won."
                  : <>Fires <code className="bg-[var(--bg-3)] px-1 rounded">payment.unpaid</code>. Set <code className="bg-[var(--bg-3)] px-1 rounded">TEST_DUNNING_DELAY_MS</code> for fast dunning.</>
                }
              </p>
            </>
          )}

          {/* ── REVIVAL ── */}
          {mode === "revival" && (
            <>
              <div className="space-y-1.5">
                <Label>Lead to revive</Label>
                {leads.length === 0 ? (
                  <p className="text-xs text-[var(--text-3)]">No leads yet.</p>
                ) : (
                  <Select value={reviveLeadId} onValueChange={setReviveLeadId}>
                    <SelectTrigger><SelectValue placeholder="Pick a lead…" /></SelectTrigger>
                    <SelectContent>
                      {leads.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name ?? "Unnamed"} <span className="text-[var(--text-3)]">({l.channel})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-[11px] text-[var(--text-3)]">
                Starts a ghost revival sequence. Set{" "}
                <code className="bg-[var(--bg-3)] px-1 rounded">TEST_REVIVAL_DELAY_MS</code> for fast nudges.
                The sequence auto-stops if the lead replies.
              </p>
            </>
          )}

          {error   && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {success && <p className="text-sm text-[var(--brand)]">{success}</p>}
        </div>

        <SheetFooter className="shrink-0 px-6 py-4">
          <Button
            variant="primary"
            className="w-full gap-2"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {MODE_LABELS[mode]}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
