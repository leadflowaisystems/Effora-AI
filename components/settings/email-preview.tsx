"use client";

import * as React from "react";
import { Mail, Send, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Props {
  orgId:      string;
  userEmail?: string;
}

const TEMPLATES = [
  { key: "bookingConfirmation", label: "Booking confirmation" },
  { key: "bookingReminder24h",  label: "24h reminder" },
  { key: "paymentLink",         label: "Payment link" },
  { key: "paymentReceived",     label: "Payment receipt" },
  { key: "dunningEmail",        label: "Payment follow-up" },
  { key: "revivalNudge",        label: "Revival nudge" },
];

export function EmailPreview({ orgId, userEmail }: Props) {
  const [open,     setOpen]     = React.useState(false);
  const [selected, setSelected] = React.useState("bookingConfirmation");
  const [html,     setHtml]     = React.useState<string | null>(null);
  const [loading,  setLoading]  = React.useState(false);
  const [sending,  setSending]  = React.useState(false);

  async function loadPreview(tmpl: string) {
    setSelected(tmpl);
    setLoading(true);
    try {
      const res  = await fetch(`/api/orgs/${orgId}/email-preview?template=${tmpl}`);
      const data = await res.json();
      setHtml(data.html ?? null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (open && !html) loadPreview(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function sendTest() {
    setSending(true);
    try {
      const res  = await fetch(`/api/orgs/${orgId}/email-preview`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ template: selected, sendTo: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `Test email sent to ${data.sentTo}`, variant: "success" });
    } catch (err) {
      toast({ title: "Send failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors rounded-[var(--radius-lg)]"
      >
        <span className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[var(--brand)]" />
          Email preview &amp; test send
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-4 space-y-4">
          {/* Template picker */}
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => loadPreview(t.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  selected === t.key
                    ? "bg-[var(--brand)] border-[var(--brand)] text-[#0A0A0C]"
                    : "border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-2)] hover:border-[var(--text-3)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Preview iframe */}
          <div className="rounded-[var(--radius)] border border-[var(--border)] overflow-hidden bg-[#0A0A0C]" style={{ height: 320 }}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--text-3)]" />
              </div>
            ) : html ? (
              <iframe
                srcDoc={html}
                className="w-full h-full border-0"
                sandbox="allow-same-origin"
                title="Email preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-[var(--text-3)]">
                Select a template above
              </div>
            )}
          </div>

          {/* Send test */}
          {userEmail && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-[var(--text-3)] flex-1">
                Test will be sent to <span className="text-[var(--text-2)]">{userEmail}</span>
              </p>
              <button
                onClick={sendTest}
                disabled={sending || !html}
                className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] disabled:opacity-50 transition-colors"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                {sending ? "Sending…" : "Send test"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
