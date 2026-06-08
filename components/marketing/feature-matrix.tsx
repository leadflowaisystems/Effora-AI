"use client";

import * as React from "react";
import { Check, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureRow {
  feature:   string;
  tooltip?:  string;
  starter:   string | boolean;
  growth:    string | boolean;
  pro:       string | boolean;
  category?: string; // used as section header when set
}

const ROWS: FeatureRow[] = [
  // ── AI ──────────────────────────────────────────────────────
  { category: "AI & Automation", feature: "", starter: false, growth: false, pro: false },
  {
    feature:  "AI Reply Assistant",
    tooltip:  "Paste any DM and get 3 smart, on-brand replies instantly.",
    starter:  "500 / mo",
    growth:   "5,000 / mo",
    pro:      "20,000 / mo",
  },
  {
    feature:  "Auto AI replies (hands-free)",
    tooltip:  "AI replies to inbound DMs automatically without you lifting a finger.",
    starter:  false,
    growth:   false,
    pro:      true,
  },
  {
    feature:  "Copilot — AI command center",
    tooltip:  "Natural-language commands to query your CRM, pipeline, and revenue in real time.",
    starter:  false,
    growth:   false,
    pro:      true,
  },
  {
    feature:  "Screenshot / OCR parsing",
    tooltip:  "Upload a screenshot of a DM conversation and the AI extracts lead data automatically.",
    starter:  false,
    growth:   true,
    pro:      true,
  },
  // ── CRM ─────────────────────────────────────────────────────
  { category: "CRM & Leads", feature: "", starter: false, growth: false, pro: false },
  {
    feature:  "Lead CRM",
    tooltip:  "Track every prospect with notes, stage, and full conversation history.",
    starter:  "2,000 leads",
    growth:   "10,000 leads",
    pro:      "50,000 leads",
  },
  {
    feature:  "Groups",
    tooltip:  "Segment leads into groups for targeted follow-up.",
    starter:  "10 groups",
    growth:   "Unlimited",
    pro:      "Unlimited",
  },
  {
    feature:  "Ghost revival sequences",
    tooltip:  "Automatically re-engage cold leads who stopped responding.",
    starter:  false,
    growth:   true,
    pro:      true,
  },
  // ── Messaging ────────────────────────────────────────────────
  { category: "Messaging & Channels", feature: "", starter: false, growth: false, pro: false },
  {
    feature:  "Instagram DMs",
    tooltip:  "Receive and reply to Instagram direct messages.",
    starter:  true,
    growth:   true,
    pro:      true,
  },
  {
    feature:  "WhatsApp Business",
    tooltip:  "Send and receive messages via WhatsApp Cloud API.",
    starter:  true,
    growth:   true,
    pro:      true,
  },
  {
    feature:  "Broadcasts (mass messaging)",
    tooltip:  "Send one message to hundreds of leads at once — great for promotions and launches.",
    starter:  false,
    growth:   "Unlimited",
    pro:      "Unlimited",
  },
  {
    feature:  "Scheduled messages",
    tooltip:  "Queue messages to send at a specific date and time.",
    starter:  false,
    growth:   true,
    pro:      true,
  },
  {
    feature:  "Recurring payments",
    tooltip:  "Set up automatic recurring payment reminders for subscription clients.",
    starter:  false,
    growth:   true,
    pro:      true,
  },
  // ── Bookings & Payments ──────────────────────────────────────
  { category: "Bookings & Payments", feature: "", starter: false, growth: false, pro: false },
  {
    feature:  "Cal.com booking integration",
    tooltip:  "Share a smart booking link so leads can book calls directly from a DM.",
    starter:  true,
    growth:   true,
    pro:      true,
  },
  {
    feature:  "Manual booking + payment recording",
    tooltip:  "Log bookings and payments manually for offline or cash transactions.",
    starter:  true,
    growth:   true,
    pro:      true,
  },
  {
    feature:  "UPI or Razorpay payment links",
    tooltip:  "Generate and send payment links directly inside Effora AI.",
    starter:  true,
    growth:   true,
    pro:      true,
  },
  // ── Analytics ────────────────────────────────────────────────
  { category: "Analytics & Reporting", feature: "", starter: false, growth: false, pro: false },
  {
    feature:  "Weekly email report",
    tooltip:  "Automated weekly summary of leads, revenue, and activity delivered to your inbox.",
    starter:  true,
    growth:   true,
    pro:      true,
  },
  {
    feature:  "Trends & insights",
    tooltip:  "90-day revenue, lead, and AI usage trends with visual charts.",
    starter:  false,
    growth:   true,
    pro:      true,
  },
  {
    feature:  "Weekly scorecards",
    tooltip:  "Detailed AI-generated performance scorecards with coaching recommendations.",
    starter:  false,
    growth:   false,
    pro:      true,
  },
  // ── Workspace ────────────────────────────────────────────────
  { category: "Workspace", feature: "", starter: false, growth: false, pro: false },
  {
    feature:  "Team seats",
    tooltip:  "Invite teammates to collaborate on your pipeline.",
    starter:  "1 seat",
    growth:   "2 seats",
    pro:      "5 seats",
  },
  {
    feature:  "Public funnel page",
    tooltip:  "A branded landing page that captures lead info and books calls automatically.",
    starter:  "1 page",
    growth:   "3 pages",
    pro:      "Unlimited",
  },
  {
    feature:  "Agency mode",
    tooltip:  "Manage multiple client organisations from a single Effora AI account.",
    starter:  false,
    growth:   false,
    pro:      true,
  },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === false) {
    return <Minus className="mx-auto h-4 w-4 text-[var(--text-3)] opacity-40" />;
  }
  if (value === true) {
    return <Check className="mx-auto h-4 w-4 text-[var(--brand)]" />;
  }
  return <span className="text-xs font-medium text-[var(--text-2)]">{value}</span>;
}

export function FeatureMatrix() {
  const [tooltip, setTooltip] = React.useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        {/* Header */}
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-2)]">
            <th className="w-[40%] px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">
              Feature
            </th>
            {(["Starter", "Growth", "Pro"] as const).map((p, i) => (
              <th key={p} className={cn(
                "px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide",
                i === 1 ? "text-[var(--brand)]" : "text-[var(--text-3)]",
              )}>
                {p}
                {i === 1 && (
                  <span className="ml-1.5 rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[9px] font-bold text-[#0A0A0C] normal-case tracking-normal">
                    Popular
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, idx) => {
            if (row.category) {
              return (
                <tr key={`cat-${idx}`} className="bg-[var(--bg-2)]/60 border-t border-[var(--border)]">
                  <td colSpan={4} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-3)]">
                    {row.category}
                  </td>
                </tr>
              );
            }
            return (
              <tr
                key={`row-${idx}`}
                className="border-t border-[var(--border)] hover:bg-[var(--bg-2)]/40 transition-colors"
              >
                {/* Feature name + tooltip */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[var(--text-2)]">{row.feature}</span>
                    {row.tooltip && (
                      <button
                        type="button"
                        className="relative shrink-0 text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
                        onMouseEnter={() => setTooltip(`${idx}`)}
                        onMouseLeave={() => setTooltip(null)}
                        onFocus={() => setTooltip(`${idx}`)}
                        onBlur={() => setTooltip(null)}
                        aria-label={`Info: ${row.feature}`}
                      >
                        <Info className="h-3.5 w-3.5" />
                        {tooltip === `${idx}` && (
                          <div className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-xs text-[var(--text-2)] shadow-lg">
                            {row.tooltip}
                          </div>
                        )}
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center"><Cell value={row.starter} /></td>
                <td className="px-4 py-3 text-center bg-[var(--brand)]/[0.03]"><Cell value={row.growth} /></td>
                <td className="px-4 py-3 text-center"><Cell value={row.pro} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
