"use client";

import * as React from "react";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast }  from "@/components/ui/use-toast";
import { cn }     from "@/lib/utils";
import { useRouter } from "next/navigation";

export type PaymentMode = "razorpay_only" | "upi_only" | "both";

interface Props {
  orgId:        string;
  initialMode:  PaymentMode;
  hasRazorpay:  boolean;
  hasUpiId:     boolean;
}

const OPTIONS: Array<{ value: PaymentMode; label: string; description: string }> = [
  {
    value:       "both",
    label:       "Both (Razorpay preferred, UPI fallback)",
    description: "Try Razorpay first; fall back to UPI if Razorpay is unavailable. Requires at least one method configured.",
  },
  {
    value:       "razorpay_only",
    label:       "Razorpay Only",
    description: "Generate Razorpay payment links exclusively. UPI is never used. Requires active Razorpay credentials.",
  },
  {
    value:       "upi_only",
    label:       "UPI Only",
    description: "Generate UPI deep links exclusively. Razorpay is never used. Requires a saved UPI ID.",
  },
];

export function PaymentModeForm({ orgId, initialMode, hasRazorpay, hasUpiId }: Props) {
  const router          = useRouter();
  const [mode, setMode] = React.useState<PaymentMode>(initialMode);
  const [saving, setSaving] = React.useState(false);

  const warning: string | null = (() => {
    if (mode === "razorpay_only" && !hasRazorpay)
      return "Connect your Razorpay API keys above before enabling Razorpay Only mode.";
    if (mode === "upi_only" && !hasUpiId)
      return "Save a UPI ID below before enabling UPI Only mode.";
    if (mode === "both" && !hasRazorpay && !hasUpiId)
      return "Configure at least one payment method (Razorpay or UPI ID) before saving.";
    return null;
  })();

  const canSave = !warning;
  const isDirty = mode !== initialMode;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !isDirty) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/payment-mode`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ payment_mode: mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      toast({ title: "Payment mode saved", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title:       "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant:     "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex items-start gap-3 rounded-[var(--radius)] border p-3.5 cursor-pointer transition-colors",
              mode === opt.value
                ? "border-[var(--brand)] bg-[var(--brand)]/5"
                : "border-[var(--border)] hover:border-[var(--text-3)]",
            )}
          >
            <input
              type="radio"
              name="payment_mode"
              value={opt.value}
              checked={mode === opt.value}
              onChange={() => setMode(opt.value)}
              className="mt-0.5 accent-[var(--brand)]"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text)]">{opt.label}</p>
              <p className="text-xs text-[var(--text-3)] leading-relaxed mt-0.5">{opt.description}</p>
            </div>
          </label>
        ))}
      </div>

      {warning && (
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400/90">{warning}</p>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={saving || !canSave || !isDirty}
        className="w-full sm:w-auto"
      >
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
        ) : (
          <><Check className="h-4 w-4" /> Save payment mode</>
        )}
      </Button>
    </form>
  );
}
