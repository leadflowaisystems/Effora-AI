"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function PageTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    fetch("/api/analytics/pageview", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ path: pathname }),
    }).catch(() => null);
  }, [pathname]);

  return null;
}
