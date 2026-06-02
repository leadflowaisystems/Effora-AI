"use client";

/**
 * ComplianceGate — shows a modal with required checkboxes before a risky action.
 * Once the user checks all boxes and confirms, the flag is saved to the server
 * and the modal won't appear again (for that org/flag combination).
 *
 * Usage:
 *   const { gate, ComplianceModal } = useComplianceGate({
 *     orgId, flag: "broadcast_policy_accepted",
 *     onAccepted: () => sendBroadcast()
 *   });
 *
 *   <button onClick={gate}>Send broadcast</button>
 *   {ComplianceModal}
 */

import * as React from "react";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComplianceItem {
  id:   string;
  text: React.ReactNode;
}

interface Options {
  orgId:       string;
  flag:        string;
  title:       string;
  description: string;
  items:       ComplianceItem[];
  onAccepted:  () => void;
}

// ── Pre-built compliance item sets ────────────────────────────────────────────

export const BROADCAST_COMPLIANCE_ITEMS: ComplianceItem[] = [
  {
    id:   "opted_in",
    text: "All recipients have explicitly opted in to receive messages from my business (e.g. by messaging me first, signing up via my funnel, or being added with their consent).",
  },
  {
    id:   "24h_window",
    text: "I understand WhatsApp messages outside the 24-hour conversation window require pre-approved templates — free-form messages will be skipped otherwise.",
  },
  {
    id:   "account_risk",
    text: "I understand sending unsolicited messages may result in Meta suspending my Instagram or WhatsApp account.",
  },
  {
    id:   "platform_terms",
    text: <>I agree to comply with <a href="https://www.facebook.com/legal/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--text)]">Meta&apos;s Platform Terms</a> and <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--text)]">WhatsApp Business Policy</a>.</>,
  },
];

export const GROUP_PAYMENT_COMPLIANCE_ITEMS: ComplianceItem[] = [
  {
    id:   "payment_authorization",
    text: "I confirm I have authorization to request payment from each member of this group — they have agreed to purchase my service.",
  },
];

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useComplianceGate(opts: Options) {
  const { orgId, flag, onAccepted } = opts;
  const [showModal,  setShowModal]  = React.useState(false);
  const [checking,   setChecking]   = React.useState(false);
  const [checked,    setChecked]    = React.useState<Set<string>>(new Set());
  const [saving,     setSaving]     = React.useState(false);
  const [alreadyOk,  setAlreadyOk]  = React.useState<boolean | null>(null);

  // Check acceptance status once on mount
  React.useEffect(() => {
    let cancelled = false;
    setChecking(true);
    fetch(`/api/orgs/${orgId}/compliance?flag=${encodeURIComponent(flag)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAlreadyOk(!!(d as { accepted?: boolean }).accepted); })
      .catch(() => { if (!cancelled) setAlreadyOk(false); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [orgId, flag]);

  function gate() {
    if (alreadyOk) { onAccepted(); return; }
    setShowModal(true);
  }

  async function accept() {
    if (checked.size < opts.items.length) return;
    setSaving(true);
    try {
      await fetch(`/api/orgs/${orgId}/compliance`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ flag }),
      });
      setAlreadyOk(true);
      setShowModal(false);
      onAccepted();
    } catch { /* non-fatal — proceed anyway */ onAccepted(); }
    finally { setSaving(false); }
  }

  const allChecked = checked.size === opts.items.length;

  const Modal = showModal ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-1)] p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-[var(--text)] leading-tight">{opts.title}</h2>
          <button onClick={() => setShowModal(false)} className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-3)] leading-relaxed">{opts.description}</p>

        <div className="space-y-3">
          {opts.items.map((item) => {
            const isChecked = checked.has(item.id);
            return (
              <label key={item.id} className="flex items-start gap-2.5 cursor-pointer group">
                <div className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  isChecked ? "border-[var(--brand)] bg-[var(--brand)]" : "border-[var(--border)] bg-[var(--bg-3)] group-hover:border-[var(--brand)]/50"
                )}>
                  {isChecked && (
                    <svg className="h-2.5 w-2.5 text-[#0A0A0C]" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  <input type="checkbox" className="sr-only" checked={isChecked}
                    onChange={(e) => setChecked((s) => {
                      const n = new Set(s);
                      if (e.target.checked) { n.add(item.id); } else { n.delete(item.id); }
                      return n;
                    })} />
                </div>
                <span className="text-xs text-[var(--text-2)] leading-relaxed">{item.text}</span>
              </label>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={() => setShowModal(false)}
            className="flex-1 rounded-[var(--radius)] border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors">
            Cancel
          </button>
          <button
            onClick={accept}
            disabled={!allChecked || saving}
            className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] py-2 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Confirming…" : "I confirm — continue"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { gate, ComplianceModal: Modal, checking, alreadyOk };
}
