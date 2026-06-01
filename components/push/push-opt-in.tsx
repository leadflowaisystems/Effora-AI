"use client";

/**
 * PushOptIn — slim banner shown once per device when Notification.permission === 'default'.
 * Asks user to enable push notifications. Hides forever on dismiss or after granting.
 */

import * as React from "react";
import { Bell, X } from "lucide-react";

interface Props {
  orgId:   string;
  orgSlug: string;
  /** VAPID public key (base64url) passed from env via server component */
  vapidKey: string;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding  = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw      = window.atob(base64);
  const arr      = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export function PushOptIn({ orgId, vapidKey }: Props) {
  const [visible, setVisible] = React.useState(false);
  const [busy,    setBusy]    = React.useState(false);

  React.useEffect(() => {
    // Only show when: Push API available, permission not yet decided, not dismissed
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem("push_dismissed")) return;
    setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem("push_dismissed", "1");
    setVisible(false);
  }

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { dismiss(); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
      await fetch(`/api/orgs/${orgId}/push-subscribe`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          endpoint: json.endpoint,
          p256dh:   json.keys?.p256dh ?? "",
          auth:     json.keys?.auth   ?? "",
        }),
      });
      setVisible(false);
    } catch {
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 border-b border-[var(--brand)]/20 bg-[var(--brand)]/5 px-4 py-2.5">
      <Bell className="h-4 w-4 shrink-0 text-[var(--brand)]" />
      <p className="flex-1 text-xs text-[var(--text-2)]">
        Get notified when new leads arrive
      </p>
      <button
        onClick={enable}
        disabled={busy}
        className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-1 text-xs font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[36px]"
      >
        {busy ? "…" : "Enable"}
      </button>
      <button onClick={dismiss} className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
