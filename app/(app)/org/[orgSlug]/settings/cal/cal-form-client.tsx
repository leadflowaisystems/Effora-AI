"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Check, Eye, EyeOff, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { toast }  from "@/components/ui/use-toast";

interface Props {
  orgId:          string;
  orgSlug:        string;
  initialCalLink: string;
  /**
   * True when a webhook secret is already stored for this org. Only the
   * presence flag reaches the browser — never the secret, and never its
   * encrypted form.
   */
  hasWebhookSecret?: boolean;
}

export function CalSettingsForm({ orgId, orgSlug, initialCalLink, hasWebhookSecret = false }: Props) {
  const router  = useRouter();
  const [link,   setLink]   = React.useState(initialCalLink);
  const [webhookSecret,     setWebhookSecret]     = React.useState("");
  const [showWebhookSecret, setShowWebhookSecret] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // Resolved after mount rather than during render: reading window during SSR
  // would render an empty origin on the server and a real one on the client,
  // which is a hydration mismatch.
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Only send webhook_secret when the field was actually filled in.
      // Omitting it leaves any stored value untouched — the integrations route
      // merges over the existing config rather than replacing it, and skips
      // empty strings. This is the same contract the Razorpay form relies on.
      const config: Record<string, string> = { cal_link: link.trim() };
      if (webhookSecret.trim()) config.webhook_secret = webhookSecret.trim();

      const res = await fetch(`/api/orgs/${orgId}/integrations`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          provider: "calcom",
          config,
          // Activation is driven by the Cal.com link alone, unchanged from
          // before the webhook-secret field existed. The integrations PUT skips
          // empty strings and merges over the stored config, so cal_link is
          // never actually removed — active=false IS the disable mechanism when
          // the user clears the link. Letting a stored secret hold the
          // integration active would leave getCalLink() serving the stale URL.
          active:   !!link.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Failed to save");
      }
      toast({
        title:       "Saved",
        description: webhookSecret.trim() ? "Cal.com settings updated." : "Cal.com link updated.",
        variant:     "success",
      });
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
    <form onSubmit={handleSave} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="cal-link">
          Your Cal.com booking URL{" "}
          <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
        </Label>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
          <Input
            id="cal-link"
            type="url"
            placeholder="https://cal.com/yourname/discovery"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="flex-1"
          />
        </div>
        <p className="text-xs text-[var(--text-3)]">
          The AI includes this link when a lead scores hot and is ready to book.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cal-webhook-secret">
          Webhook secret <span className="text-[var(--brand)] font-medium">*</span>
        </Label>

        {hasWebhookSecret ? (
          <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--brand)]/30 bg-[var(--brand)]/5 px-3 py-2 text-xs text-[var(--brand)]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            A webhook secret is saved. Bookings from Cal.com are being verified.
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              No webhook secret saved. Until you add one, Effora rejects every booking
              webhook from Cal.com — bookings will not appear here, and no confirmation
              or reminder is sent.
            </span>
          </div>
        )}

        <div className="relative flex items-center">
          <Input
            id="cal-webhook-secret"
            type={showWebhookSecret ? "text" : "password"}
            placeholder={hasWebhookSecret ? "Saved — enter a new value to replace it" : "Paste the secret from Cal.com"}
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            className="pr-9"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowWebhookSecret((v) => !v)}
            className="absolute right-2.5 text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
            aria-label={showWebhookSecret ? "Hide secret" : "Show secret"}
          >
            {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <p className="text-xs text-[var(--text-3)]">
          When you add the Effora webhook in Cal.com, Cal.com shows a secret for it.
          Copy that secret and paste it here. Stored encrypted and never shown again —{" "}
          {hasWebhookSecret
            ? "leave this blank to keep the current one."
            : "you can replace it at any time."}
        </p>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2.5">
        <p className="text-xs font-medium text-[var(--text-2)]">Webhook URL for Cal.com</p>
        <code className="mt-1 block break-all font-mono text-[11px] text-[var(--text-3)]">
          {origin}/api/webhooks/calcom/{orgId}
        </code>
      </div>

      <Button type="submit" variant="primary" disabled={saving} className="w-full sm:w-auto">
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
        ) : (
          <><Check className="h-4 w-4" /> Save settings</>
        )}
      </Button>
    </form>
  );
}
