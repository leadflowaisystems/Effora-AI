"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied:    "You denied the Instagram connection. Try again when ready.",
  missing_params:  "Something went wrong with the OAuth flow. Please try again.",
  invalid_state:   "Session mismatch — please try connecting again.",
  org_not_found:   "Organization not found.",
  no_ig_account:   "No Instagram Business account found linked to your Facebook Pages. Make sure your IG account is a Business account connected to a Facebook Page.",
  exchange_failed: "Failed to exchange OAuth token with Meta. Please try again.",
};

interface Props {
  connected: boolean;
  error:     string | null;
}

export function InstagramConnectClient({ connected, error }: Props) {
  const [visible, setVisible] = React.useState(connected || !!error);

  React.useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-[var(--radius)] border border-red-500/30 bg-red-500/5 px-3 py-2.5">
        <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
        <p className="text-xs text-red-400 leading-relaxed">
          {ERROR_MESSAGES[error] ?? `Connection failed: ${error}`}
        </p>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--brand)]/30 bg-[var(--brand)]/5 px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-[var(--brand)] shrink-0" />
        <p className="text-xs text-[var(--brand)]">
          Instagram Business account connected successfully!
        </p>
      </div>
    );
  }

  return null;
}
