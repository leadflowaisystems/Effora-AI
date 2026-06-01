"use client";

import * as React from "react";
import { PlusCircle, Loader2, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface ManualPaymentLead { id: string; name: string | null; channel: string }

interface Props {
  orgId:  string;
  leads:  ManualPaymentLead[];
  onDone: () => void;
}

const METHODS = [
  { value: "upi",           label: "UPI"          },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash",          label: "Cash"          },
  { value: "other",         label: "Other"         },
] as const;

export function ManualPaymentSheet({ orgId, leads, onDone }: Props) {
  const [open,        setOpen]       = React.useState(false);
  const [leadId,      setLeadId]     = React.useState("");
  const [amount,      setAmount]     = React.useState("");
  const [method,      setMethod]     = React.useState<"upi"|"bank_transfer"|"cash"|"other">("upi");
  const [receivedAt,  setReceivedAt] = React.useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription]= React.useState("");
  const [saving,      setSaving]     = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId || !amount) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/payments/manual`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          lead_id:        leadId,
          amount_inr:     Number(amount),
          payment_method: method,
          received_at:    new Date(receivedAt).toISOString(),
          description:    description || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "Payment recorded", description: "Lead marked as Won.", variant: "success" });
      setOpen(false);
      setLeadId(""); setAmount(""); setMethod("upi"); setDescription("");
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
        <PlusCircle className="h-3.5 w-3.5" />
        Record payment manually
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
              <h2 className="font-display text-base font-semibold text-[var(--text)]">Record payment manually</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-[var(--text-3)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Lead <span className="text-[var(--brand)]">*</span></label>
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} required className={inputCls}>
                  <option value="">Select a lead…</option>
                  {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? "Unnamed"} ({l.channel})</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Amount (₹) <span className="text-[var(--brand)]">*</span></label>
                <input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="5000" className={inputCls} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Payment method <span className="text-[var(--brand)]">*</span></label>
                <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={inputCls}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Date received <span className="text-[var(--brand)]">*</span></label>
                <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} required className={inputCls} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Description <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="3-month coaching program" className={inputCls} />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-[var(--radius)] border border-[var(--border)] py-2.5 text-sm text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">Cancel</button>
              <button type="submit" disabled={saving || !leadId || !amount}
                className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] py-2.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Saving…" : "Record payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
