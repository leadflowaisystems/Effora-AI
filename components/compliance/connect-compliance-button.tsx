"use client";

/**
 * ConnectComplianceButton
 * Shows a compliance checkbox modal before redirecting to Meta OAuth.
 * Used for both Instagram and WhatsApp connect flows.
 * Once accepted the flag is saved; subsequent clicks bypass the modal.
 */

import * as React from "react";
import { X, Loader2, Instagram, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

const IG_ITEMS = [
  {
    id:   "ig_manage_dms",
    text: "I understand Effora will read and reply to my Instagram DMs on my behalf when I compose messages in this app.",
  },
  {
    id:   "ig_no_auto",
    text: "Effora will never send messages without my explicit action (draft approval or manual send).",
  },
  {
    id:   "ig_platform_terms",
    text: <>I agree to Meta&apos;s <a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Platform Terms</a>.</>,
  },
];

const WA_ITEMS = [
  {
    id:   "wa_manage",
    text: "I understand Effora will manage my WhatsApp Business conversations when I use this app.",
  },
  {
    id:   "wa_optin",
    text: "I will only message customers who have opted in, and will use approved templates outside the 24-hour messaging window.",
  },
  {
    id:   "wa_platform_terms",
    text: <>I agree to Meta&apos;s <a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Platform Terms</a> and <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">WhatsApp Business Policy</a>.</>,
  },
];

interface Props {
  orgId:      string;
  channel:    "instagram" | "whatsapp";
  connectUrl: string;
  label:      string;
  className?: string;
}

export function ConnectComplianceButton({ orgId, channel, connectUrl, label, className }: Props) {
  const [showModal, setShowModal] = React.useState(false);
  const [checked,   setChecked]   = React.useState<Set<string>>(new Set());
  const [saving,    setSaving]    = React.useState(false);
  const [ready,     setReady]     = React.useState<boolean | null>(null); // null = checking

  const items = channel === "instagram" ? IG_ITEMS : WA_ITEMS;
  const flag  = channel === "instagram" ? "instagram_connect_accepted" : "whatsapp_connect_accepted";
  const allChecked = checked.size === items.length;

  // Check acceptance status on mount
  React.useEffect(() => {
    fetch(`/api/orgs/${orgId}/compliance?flag=${flag}`)
      .then((r) => r.json())
      .then((d) => setReady(!!(d as { accepted?: boolean }).accepted))
      .catch(() => setReady(false));
  }, [orgId, flag]);

  function handleClick() {
    if (ready) {
      // Already accepted — go straight to OAuth
      window.location.href = connectUrl;
    } else {
      setShowModal(true);
    }
  }

  async function handleConfirm() {
    if (!allChecked) return;
    setSaving(true);
    try {
      await fetch(`/api/orgs/${orgId}/compliance`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ flag }),
      });
      setReady(true);
      setShowModal(false);
      // Navigate after modal closes
      window.location.href = connectUrl;
    } catch {
      // Non-fatal — proceed anyway
      setShowModal(false);
      window.location.href = connectUrl;
    } finally {
      setSaving(false);
    }
  }

  const Icon = channel === "instagram" ? Instagram : Phone;

  return (
    <>
      <button
        onClick={handleClick}
        disabled={ready === null} // checking
        className={cn(
          "inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity",
          className
        )}
      >
        <Icon className="h-4 w-4" />
        {ready === null ? "Checking…" : label}
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-1)] p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-[var(--text)] leading-tight">
                Before connecting {channel === "instagram" ? "Instagram" : "WhatsApp"}
              </h2>
              <button onClick={() => setShowModal(false)} className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-3)] leading-relaxed">
              Please confirm you understand how Effora uses your {channel === "instagram" ? "Instagram" : "WhatsApp"} account:
            </p>

            <div className="space-y-3">
              {items.map((item) => {
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
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isChecked}
                        onChange={(e) => setChecked((s) => {
                          const n = new Set(s);
                          if (e.target.checked) { n.add(item.id); } else { n.delete(item.id); }
                          return n;
                        })}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-2)] leading-relaxed">{item.text}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-[var(--radius)] border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!allChecked || saving}
                className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] py-2 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Saving…" : `Connect ${channel === "instagram" ? "Instagram" : "WhatsApp"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
