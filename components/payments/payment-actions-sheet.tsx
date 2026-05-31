"use client";

/**
 * PaymentActionsSheet — two distinct payment actions for coaches:
 *  A) Request payment from lead  → link-generate (creates pending + sends link in thread)
 *  B) Mark payment as received   → mark-paid (records captured + sends receipt in thread)
 */

import * as React from "react";
import { Link2, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface PaymentActionLead { id: string; name: string | null; channel: string }

interface Props {
  orgId:  string;
  leads:  PaymentActionLead[];
  onDone: () => void;
}

type Mode = "request" | "mark";

const inputCls =
  "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

const REQUEST_METHODS = [
  { value: "razorpay", label: "Razorpay link" },
  { value: "upi",      label: "UPI link"      },
] as const;

const MARK_METHODS = [
  { value: "upi",           label: "UPI"          },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "razorpay",      label: "Razorpay"     },
  { value: "cash",          label: "Cash"         },
  { value: "other",         label: "Other"        },
] as const;

function SheetWrap({ title, onClose, children, onSubmit, saving, disabled, submitLabel }:
  { title: string; onClose: () => void; children: React.ReactNode;
    onSubmit: (e: React.FormEvent) => void; saving: boolean; disabled: boolean; submitLabel: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <form onSubmit={onSubmit}
        className="relative z-10 w-full max-w-sm bg-[var(--bg-1)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[var(--text)]">{title}</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-[var(--radius)] border border-[var(--border)] py-2.5 text-sm text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving || disabled}
            className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] py-2.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function PaymentActionsSheet({ orgId, leads, onDone }: Props) {
  const [mode,   setMode]   = React.useState<Mode | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Request form state
  const [rLead,   setRLead]   = React.useState("");
  const [rAmount, setRAmount] = React.useState("");
  const [rDesc,   setRDesc]   = React.useState("");
  const [rMethod, setRMethod] = React.useState<"razorpay" | "upi">("razorpay");

  // Mark form state
  const [mLead,      setMLead]      = React.useState("");
  const [mAmount,    setMAmount]    = React.useState("");
  const [mMethod,    setMMethod]    = React.useState("upi");
  const [mDate,      setMDate]      = React.useState(new Date().toISOString().slice(0, 10));
  const [mDesc,      setMDesc]      = React.useState("");

  function close() { setMode(null); }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!rLead || !rAmount || !rDesc) return;
    setSaving(true);
    try {
      const res  = await fetch(`/api/orgs/${orgId}/payments/link-generate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ lead_id: rLead, amount_inr: Number(rAmount), description: rDesc, method: rMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      // Copy link to clipboard
      if (data.link_url) {
        await navigator.clipboard.writeText(data.link_url).catch(() => null);
        toast({ title: "Payment link created", description: "Link sent to lead's inbox. Copied to clipboard.", variant: "success" });
      } else {
        toast({ title: "Payment link created", description: "Link sent to lead's inbox.", variant: "success" });
      }
      close(); onDone();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function submitMark(e: React.FormEvent) {
    e.preventDefault();
    if (!mLead || !mAmount) return;
    setSaving(true);
    try {
      const res  = await fetch(`/api/orgs/${orgId}/payments/mark-paid`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          lead_id: mLead, amount_inr: Number(mAmount),
          payment_method: mMethod, received_at: new Date(mDate).toISOString(),
          description: mDesc || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "Payment recorded", description: "Lead marked as Won. Receipt sent to inbox.", variant: "success" });
      close(); onDone();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Two trigger buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setMode("request")}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">
          <Link2 className="h-3.5 w-3.5" /> Request payment
        </button>
        <button onClick={() => setMode("mark")}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors">
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark as received
        </button>
      </div>

      {/* Request sheet */}
      {mode === "request" && (
        <SheetWrap title="Request payment from lead" onClose={close}
          onSubmit={submitRequest} saving={saving}
          disabled={!rLead || !rAmount || !rDesc} submitLabel="Send payment request">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Lead <span className="text-[var(--brand)]">*</span></label>
              <select value={rLead} onChange={(e) => setRLead(e.target.value)} required className={inputCls}>
                <option value="">Select lead…</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? "Unnamed"} ({l.channel})</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Amount (₹) <span className="text-[var(--brand)]">*</span></label>
              <input type="number" min="1" step="1" value={rAmount} onChange={(e) => setRAmount(e.target.value)} required placeholder="15000" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Description <span className="text-[var(--brand)]">*</span></label>
              <input value={rDesc} onChange={(e) => setRDesc(e.target.value)} required placeholder="3-month coaching program" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Payment method <span className="text-[var(--brand)]">*</span></label>
              <div className="flex gap-3">
                {REQUEST_METHODS.map((m) => (
                  <label key={m.value} className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] border py-2.5 text-xs font-medium cursor-pointer transition-colors",
                    rMethod === m.value ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]" : "border-[var(--border)] text-[var(--text-2)] hover:border-[var(--text-3)]"
                  )}>
                    <input type="radio" name="r-method" value={m.value} checked={rMethod === m.value}
                      onChange={() => setRMethod(m.value as typeof rMethod)} className="sr-only" />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </SheetWrap>
      )}

      {/* Mark received sheet */}
      {mode === "mark" && (
        <SheetWrap title="Mark payment as received" onClose={close}
          onSubmit={submitMark} saving={saving}
          disabled={!mLead || !mAmount} submitLabel="Record payment">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Lead <span className="text-[var(--brand)]">*</span></label>
              <select value={mLead} onChange={(e) => setMLead(e.target.value)} required className={inputCls}>
                <option value="">Select lead…</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? "Unnamed"} ({l.channel})</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Amount (₹) <span className="text-[var(--brand)]">*</span></label>
              <input type="number" min="1" step="1" value={mAmount} onChange={(e) => setMAmount(e.target.value)} required placeholder="15000" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Payment method <span className="text-[var(--brand)]">*</span></label>
              <select value={mMethod} onChange={(e) => setMMethod(e.target.value)} className={inputCls}>
                {MARK_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Date received <span className="text-[var(--brand)]">*</span></label>
              <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} required className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Description <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
              <input value={mDesc} onChange={(e) => setMDesc(e.target.value)} placeholder="3-month coaching program" className={inputCls} />
            </div>
          </div>
        </SheetWrap>
      )}
    </>
  );
}
