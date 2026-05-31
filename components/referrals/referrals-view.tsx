"use client";

import * as React from "react";
import { Copy, Check, Gift } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReferredOrg {
  id: string; name: string; plan: string;
  subscription_status: string; created_at: string;
}

interface Props {
  referralCode: string;
  referralUrl:  string;
  referredOrgs: ReferredOrg[];
}

export function ReferralsView({ referralCode, referralUrl, referredOrgs }: Props) {
  const [copied, setCopied] = React.useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const freeMonthsEarned = referredOrgs.filter(
    (o) => ["starter", "growth", "pro"].includes(o.plan),
  ).length;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Referrals</h1>
        <p className="text-sm text-[var(--text-3)] mt-1">
          Share Effora AI with other coaches. You earn a free month for every referral who pays.
        </p>
      </div>

      {/* Referral link card */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand-glow)] border border-[var(--brand)]/20">
            <Gift className="h-5 w-5 text-[var(--brand)]" />
          </div>
          <div>
            <p className="font-medium text-[var(--text)]">Your referral link</p>
            <p className="text-xs text-[var(--text-3)]">Code: <span className="font-mono">{referralCode}</span></p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 font-mono text-xs text-[var(--text-3)] truncate">
            {referralUrl}
          </div>
          <button
            onClick={handleCopy}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 py-2 text-xs font-medium transition-colors",
              copied
                ? "border-[var(--brand)] text-[var(--brand)] bg-[var(--brand-glow)]"
                : "border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-3)]",
            )}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Earnings */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--brand)]/20 bg-[var(--brand-glow)] p-4">
        <p className="text-sm font-medium text-[var(--brand)]">
          🎉 {freeMonthsEarned} free month{freeMonthsEarned === 1 ? "" : "s"} earned
        </p>
        <p className="text-xs text-[var(--text-3)] mt-1">
          You earn 1 free month for every coach who signs up through your link and pays.
          Their first month is also free as a welcome gift.
        </p>
      </div>

      {/* Referred orgs table */}
      <div>
        <h2 className="font-display text-lg font-semibold text-[var(--text)] mb-3">Referred coaches</h2>
        {referredOrgs.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-8 text-center">
            <p className="text-sm text-[var(--text-3)]">
              No referrals yet. Share your link above!
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-2)] text-xs text-[var(--text-3)]">
                  <th className="px-4 py-3 text-left font-medium">Coach</th>
                  <th className="px-4 py-3 text-left font-medium">Plan</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {referredOrgs.map((org) => (
                  <tr key={org.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--text)]">{org.name}</td>
                    <td className="px-4 py-3 text-[var(--text-3)] capitalize">{org.plan}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-xs font-medium",
                        ["starter","growth","pro"].includes(org.plan) ? "text-[var(--brand)]" : "text-[var(--warn)]",
                      )}>
                        {["starter","growth","pro"].includes(org.plan) ? "✓ Paid" : "Trial"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-3)]">
                      {new Date(org.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
