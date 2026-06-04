"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "effora_cookie_consent";

export function CookieBanner() {
  const [visible, setVisible] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    // Don't show inside the authenticated app shell
    if (pathname.startsWith("/org/")) { setVisible(false); return; }
    try {
      const accepted = localStorage.getItem(STORAGE_KEY);
      if (!accepted) setVisible(true);
    } catch { /* localStorage not available */ }
  }, [pathname]);

  function accept() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-[var(--bg-1)] border-t border-[var(--border)] px-4 py-3 shadow-lg sm:px-6">
      <p className="text-xs text-[var(--text-2)] flex-1">
        We use cookies to enable login sessions and basic analytics. By continuing you agree.{" "}
        <Link href="/privacy" className="text-[var(--brand)] underline underline-offset-2 hover:opacity-80">Privacy Policy</Link>
      </p>
      <button
        onClick={accept}
        className="shrink-0 rounded-[var(--radius)] bg-[var(--brand)] px-4 py-1.5 text-xs font-semibold text-[#0A0A0C] hover:opacity-90 transition-opacity"
      >
        Accept
      </button>
    </div>
  );
}
