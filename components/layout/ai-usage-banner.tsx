"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  plan:          string;
  aiMsgsUsed:    number;
  aiMsgsLimit:   number;   // -1 = unlimited
  orgSlug:       string;
}

export function AiUsageBanner({ plan, aiMsgsUsed, aiMsgsLimit, orgSlug }: Props) {
  if (aiMsgsLimit === -1 || aiMsgsLimit === 0) return null; // unlimited or cancelled
  if (plan === "cancelled" || plan === "trial_expired") return null;

  const pct       = Math.min(100, Math.round((aiMsgsUsed / aiMsgsLimit) * 100));
  const isAtLimit = aiMsgsUsed >= aiMsgsLimit;
  const isNear    = !isAtLimit && pct >= 80;

  if (!isAtLimit && !isNear) return null;

  return (
    <Link
      href={`/org/${orgSlug}/settings/billing`}
      className={cn(
        "flex items-center gap-2 border-b px-4 py-2 text-[11px] transition-colors hover:opacity-90",
        isAtLimit
          ? "border-red-500/30 bg-red-500/10 text-red-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-400"
      )}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <span className="flex-1 min-w-0">
        {isAtLimit
          ? `AI limit reached (${aiMsgsUsed}/${aiMsgsLimit} replies) — upgrade to continue`
          : `${pct}% of AI replies used this month (${aiMsgsUsed}/${aiMsgsLimit})`}
      </span>
      <span className="shrink-0 font-medium underline underline-offset-2">Upgrade</span>
    </Link>
  );
}
