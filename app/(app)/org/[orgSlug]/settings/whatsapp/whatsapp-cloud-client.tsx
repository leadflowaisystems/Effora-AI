"use client";

import * as React from "react";
import { Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

interface Props {
  orgId:       string;
  isConnected: boolean;
  displayPhone?: string;
}

export function WhatsAppCloudClient({ orgId, isConnected, displayPhone }: Props) {
  const [wabaId,      setWabaId]      = React.useState("");
  const [phoneNumId,  setPhoneNumId]  = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [showToken,   setShowToken]   = React.useState(false);
  const [saving,      setSaving]      = React.useState(false);

  async function handleSave() {
    if (!wabaId || !phoneNumId || !accessToken) {
      toast({ title: "All fields are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/integrations/whatsapp-cloud`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waba_id: wabaId, phone_number_id: phoneNumId, access_token: accessToken }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; display_phone_number?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast({ title: `Connected: ${data.display_phone_number ?? phoneNumId}`, variant: "success" });
      setAccessToken("");
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const inputCls = "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] font-mono";
  const labelCls = "block text-xs font-medium text-[var(--text-2)] mb-1";

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">WhatsApp Cloud API</p>
          <p className="text-xs text-[var(--text-3)] mt-0.5">Real-time inbox — receive and reply to WhatsApp messages from Effora AI</p>
        </div>
        {isConnected && (
          <div className="flex items-center gap-1.5 shrink-0 text-xs text-[var(--brand)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {displayPhone ?? "Connected"}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className={labelCls}>WABA ID (WhatsApp Business Account ID) *</label>
          <input value={wabaId} onChange={(e) => setWabaId(e.target.value)}
            className={inputCls} placeholder="123456789012345" />
        </div>
        <div>
          <label className={labelCls}>Phone Number ID *</label>
          <input value={phoneNumId} onChange={(e) => setPhoneNumId(e.target.value)}
            className={inputCls} placeholder="987654321098765" />
        </div>
        <div>
          <label className={labelCls}>
            Permanent Access Token *{" "}
            {isConnected && <span className="text-[var(--text-3)] font-normal">(leave blank to keep existing)</span>}
          </label>
          <div className="relative">
            <input value={accessToken} onChange={(e) => setAccessToken(e.target.value)}
              type={showToken ? "text" : "password"}
              className={`${inputCls} pr-10`}
              placeholder={isConnected ? "••••••••••••••••" : "EAAxxxxx..."} />
            <button type="button" onClick={() => setShowToken((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text-2)]">
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-3)] mt-1">
            <a href="https://docs.effora.ai/whatsapp-setup" target="_blank" rel="noopener"
              className="text-[var(--brand)] hover:underline inline-flex items-center gap-0.5">
              Setup guide: get tokens from Meta Business Suite <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
      </div>

      <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] p-3 space-y-1.5 text-xs text-[var(--text-3)]">
        <p className="font-medium text-[var(--text-2)]">Webhook config for Meta Business Suite:</p>
        <p>Callback URL: <code className="text-[var(--brand)]">{appUrl}/api/webhooks/whatsapp</code></p>
        <p>Subscribe to: <code className="text-[var(--text-2)]">messages</code></p>
        <p className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0 text-amber-400" />
          <span className="text-amber-400/80">After 24h window, only approved templates can be sent (WhatsApp policy)</span>
        </p>
      </div>

      <Button variant="primary" onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? "Validating & saving…" : isConnected ? "Update Cloud API credentials" : "Connect WhatsApp Cloud API"}
      </Button>
    </div>
  );
}
