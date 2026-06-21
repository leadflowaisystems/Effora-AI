"use client";

/**
 * PaymentActionsSheet — two distinct payment actions for coaches:
 *  A) Request payment from lead (individual OR group)
 *  B) Mark payment as received
 */

import * as React from "react";
import { Link2, CheckCircle2, Loader2, X, Users } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import type { PaymentMode } from "@/app/(app)/org/[orgSlug]/settings/payments/payment-mode-form-client";

export interface PaymentActionLead  { id: string; name: string | null; channel: string }
export interface PaymentActionGroup { id: string; name: string; tag: string; member_count: number }

interface Props {
  orgId:        string;
  leads:        PaymentActionLead[];
  groups?:      PaymentActionGroup[];
  onDone:       () => void;
  paymentMode:  PaymentMode;
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
        className="relative z-10 w-full max-w-sm bg-[var(--bg-1)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
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

export function PaymentActionsSheet({ orgId, leads, groups = [], onDone, paymentMode }: Props) {
  const [mode,   setMode]   = React.useState<Mode | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Derive which methods are available based on org payment mode
  const availableMethods = REQUEST_METHODS.filter((m) => {
    if (paymentMode === "razorpay_only") return m.value === "razorpay";
    if (paymentMode === "upi_only")      return m.value === "upi";
    return true;
  });
  const defaultMethod = paymentMode === "upi_only" ? "upi" : "razorpay";

  // Request form state — recipientVal is "lead:ID" or "group:ID"
  const [rRecipient,      setRRecipient]      = React.useState("");
  const [rAmount,         setRAmount]         = React.useState("");
  const [rDesc,           setRDesc]           = React.useState("");
  const [rMethod,         setRMethod]         = React.useState<"razorpay" | "upi">(defaultMethod);
  const [rCustomUrl,      setRCustomUrl]      = React.useState("");
  const [rCustomMessage,  setRCustomMessage]  = React.useState("");
  const [rSchedule,       setRSchedule]       = React.useState(false);
  const [rScheduleAt,     setRScheduleAt]     = React.useState("");

  // Mark form state
  const [mLead,   setMLead]   = React.useState("");
  const [mAmount, setMAmount] = React.useState("");
  const [mMethod, setMMethod] = React.useState("upi");
  const [mDate,   setMDate]   = React.useState(new Date().toISOString().slice(0, 10));
  const [mDesc,   setMDesc]   = React.useState("");

  function close() { setMode(null); }

  const selectedGroup = rRecipient.startsWith("group:")
    ? groups.find((g) => g.id === rRecipient.slice(6))
    : null;

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!rRecipient || !rAmount || !rDesc) return;
    setSaving(true);
    try {
      if (selectedGroup) {
        // Group payment request — fan-out
        const res = await fetch(`/api/orgs/${orgId}/payments/group-link-generate`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            group_id:       selectedGroup.id,
            amount_inr:     Number(rAmount),
            description:    rDesc,
            method:         rMethod,
            custom_url:     rCustomUrl     || undefined,
            custom_message: rCustomMessage || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        toast({
          title: `Payment requests sent`,
          description: `Sent to ${data.sent} of ${data.total} members of "${selectedGroup.name}".`,
          variant: "success",
        });
      } else {
        const leadId = rRecipient.replace("lead:", "");
        const res = await fetch(`/api/orgs/${orgId}/payments/link-generate`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            lead_id:        leadId,
            amount_inr:     Number(rAmount),
            description:    rDesc,
            method:         rMethod,
            custom_url:     rCustomUrl     || undefined,
            custom_message: rCustomMessage || undefined,
            scheduled_at:   rSchedule && rScheduleAt ? new Date(rScheduleAt).toISOString() : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        if (data.link_url) {
          await navigator.clipboard.writeText(data.link_url).catch(() => null);
          toast({ title: "Payment link created", description: "Link sent to lead's inbox. Copied to clipboard.", variant: "success" });
        } else {
          toast({ title: "Payment link created", description: "Link sent to lead's inbox.", variant: "success" });
        }
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
      const res = await fetch(`/api/orgs/${orgId}/payments/mark-paid`, {
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
      close();
      setRRecipient(""); setRAmount(""); setRDesc(""); setRCustomUrl(""); setRCustomMessage("");
      onDone();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const submitLabel = selectedGroup
    ? `Send to ${selectedGroup.member_count} members`
    : "Send payment request";

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
        <SheetWrap
          title="Request payment"
          onClose={close}
          onSubmit={submitRequest}
          saving={saving}
          disabled={!rRecipient || !rAmount || !rDesc}
          submitLabel={submitLabel}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Lead or Group <span className="text-[var(--brand)]">*</span></label>
              <select value={rRecipient} onChange={(e) => setRRecipient(e.target.value)} required className={inputCls}>
                <option value="">Select lead or group…</option>
                {leads.length > 0 && (
                  <optgroup label="Individual leads">
                    {leads.map((l) => (
                      <option key={l.id} value={`lead:${l.id}`}>{l.name ?? "Unnamed"} ({l.channel})</option>
                    ))}
                  </optgroup>
                )}
                {groups.length > 0 && (
                  <optgroup label="Groups (sends one request per member)">
                    {groups.map((g) => (
                      <option key={g.id} value={`group:${g.id}`}>📋 Group: {g.name} · {g.member_count} members</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Group preview */}
            {selectedGroup && (
              <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                <Users className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-400/90 leading-relaxed">
                  Payment request will be sent to <strong>{selectedGroup.member_count}</strong> members individually.
                  Each will receive a personalized message with their own payment link in their inbox thread.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Amount (₹) <span className="text-[var(--brand)]">*</span></label>
              <input type="number" min="1" step="1" value={rAmount} onChange={(e) => setRAmount(e.target.value)} required placeholder="15000" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Description <span className="text-[var(--brand)]">*</span></label>
              <input value={rDesc} onChange={(e) => setRDesc(e.target.value)} required placeholder="3-month coaching program" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Payment URL <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
              <input
                type="url" value={rCustomUrl} onChange={(e) => setRCustomUrl(e.target.value)}
                placeholder="Leave blank to auto-generate UPI/Razorpay link, or paste any payment URL — sent to lead instead"
                className={inputCls}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Custom message <span className="text-[var(--text-3)] text-[11px]">(optional)</span></label>
              <textarea
                value={rCustomMessage} onChange={(e) => setRCustomMessage(e.target.value)} rows={3}
                placeholder={"Leave blank to use AI-generated message, or type your own.\nVariables: {{name}} {{first_name}} {{amount}} {{description}} {{link}}"}
                className={inputCls}
                style={{ resize: "none" }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={rSchedule} onChange={(e) => setRSchedule(e.target.checked)} className="rounded" />
                <span className="text-xs font-medium text-[var(--text-2)]">Schedule for later</span>
              </label>
              {rSchedule && (
                <input
                  type="datetime-local"
                  value={rScheduleAt}
                  onChange={(e) => setRScheduleAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className={inputCls}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">
                Payment method{" "}
                <span className="text-[var(--text-3)] text-[11px]">
                  {rCustomUrl ? "(ignored — using custom URL)" : availableMethods.length === 1 ? "(fixed by payment mode)" : "*"}
                </span>
              </label>
              {availableMethods.length === 1 ? (
                <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-xs text-[var(--text-2)]">
                  {availableMethods[0].label}
                  <span className="ml-auto text-[10px] text-[var(--text-3)]">
                    Set in Settings › Payments
                  </span>
                </div>
              ) : (
                <div className={rCustomUrl ? "opacity-50 pointer-events-none" : ""}>
                  <div className="flex gap-3">
                    {availableMethods.map((m) => (
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
              )}
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
