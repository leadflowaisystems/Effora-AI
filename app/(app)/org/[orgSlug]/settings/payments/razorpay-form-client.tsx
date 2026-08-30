"use client";

import * as React from "react";
import { Loader2, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { toast }  from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

interface Props {
  orgId:        string;
  orgSlug:      string;
  initialKeyId: string;
  isConnected:  boolean;
  /** True when a webhook secret is already stored. The value itself is never sent to the client. */
  hasWebhookSecret?: boolean;
}

export function RazorpaySettingsForm({ orgId, orgSlug, initialKeyId, isConnected, hasWebhookSecret = false }: Props) {
  const router   = useRouter();
  const [keyId,      setKeyId]      = React.useState(initialKeyId);
  const [keySecret,  setKeySecret]  = React.useState("");
  const [showSecret, setShowSecret] = React.useState(false);
  const [webhookSecret,     setWebhookSecret]     = React.useState("");
  const [showWebhookSecret, setShowWebhookSecret] = React.useState(false);
  const [saving,     setSaving]     = React.useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!keyId.trim() || !keySecret.trim()) {
      toast({ title: "Both Key ID and Key Secret are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Only send webhook_secret when the field was filled in. Omitting it
      // leaves any stored value untouched (the API merges over the existing config).
      const config: Record<string, string> = {
        key_id:     keyId.trim(),
        key_secret: keySecret.trim(),
      };
      if (webhookSecret.trim()) config.webhook_secret = webhookSecret.trim();

      const res = await fetch(`/api/orgs/${orgId}/integrations`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          provider: "razorpay",
          config,
          active:   true,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Failed to save");
      }
      toast({ title: "Saved", description: "Razorpay connected.", variant: "success" });
      setKeySecret("");
      setWebhookSecret("");
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
    <form onSubmit={handleSave} className="space-y-4">
      {isConnected && (
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--brand)]/30 bg-[var(--brand)]/5 px-3 py-2 text-xs text-[var(--brand)]">
          <Check className="h-3.5 w-3.5 shrink-0" />
          Razorpay is connected. Enter new keys below to update them.
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="rz-key-id">API Key <span className="text-[var(--brand)] font-medium">*</span></Label>
        <Input
          id="rz-key-id"
          placeholder="rzp_live_..."
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rz-key-secret">Secret Key <span className="text-[var(--brand)] font-medium">*</span></Label>
        <div className="relative flex items-center">
          <Input
            id="rz-key-secret"
            type={showSecret ? "text" : "password"}
            placeholder="Enter key secret"
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-2.5 text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-[var(--text-3)]">
          Stored encrypted. Never exposed client-side.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rz-webhook-secret">Webhook Secret</Label>
        <div className="relative flex items-center">
          <Input
            id="rz-webhook-secret"
            type={showWebhookSecret ? "text" : "password"}
            placeholder={hasWebhookSecret ? "Saved — enter a new value to replace it" : "Enter webhook secret"}
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowWebhookSecret((v) => !v)}
            className="absolute right-2.5 text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
          >
            {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-[var(--text-3)]">
          {hasWebhookSecret
            ? "A webhook secret is saved. Leave this blank to keep it unchanged."
            : "Optional. The secret from your Razorpay dashboard webhook settings. Stored encrypted."}
        </p>
      </div>

      <Button type="submit" variant="primary" disabled={saving} className="w-full sm:w-auto">
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
        ) : (
          <><Check className="h-4 w-4" /> {isConnected ? "Update keys" : "Connect Razorpay"}</>
        )}
      </Button>
    </form>
  );
}
