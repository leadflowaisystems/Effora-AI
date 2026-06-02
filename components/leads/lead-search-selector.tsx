"use client";

/**
 * LeadSearchSelector — typeahead search that lets the user find and select
 * a lead. On selection, calls onSelect(leadId) and navigates to the lead
 * detail page.
 *
 * Used on both /leads (landing) and /leads/[leadId] (so the selector
 * persists while viewing a lead, allowing quick switching).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, UserCircle, Loader2, X, Instagram, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeadResult {
  id:          string;
  name:        string | null;
  external_id: string;
  channel:     string;
  stage:       string;
  score:       number;
  avatar_url:  string | null;
  metadata?:   Record<string, unknown> | null;
}

interface Props {
  orgId:       string;
  orgSlug:     string;
  selectedId?: string | null;   // currently viewed lead (highlighted in dropdown)
  placeholder?: string;
}

const STAGE_DOT: Record<string, string> = {
  hot:  "bg-red-400",
  warm: "bg-amber-400",
  cold: "bg-[var(--bg-3)]",
  won:  "bg-[var(--brand)]",
  paid: "bg-[var(--brand)]",
};

export function LeadSearchSelector({ orgId, orgSlug, selectedId, placeholder = "Search leads by name, handle or phone…" }: Props) {
  const router   = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropRef  = React.useRef<HTMLDivElement>(null);

  const [query,   setQuery]   = React.useState("");
  const [results, setResults] = React.useState<LeadResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open,    setOpen]    = React.useState(false);

  // Debounced search
  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]); setOpen(false); return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/orgs/${orgId}/leads?search=${encodeURIComponent(query)}&limit=8`);
        const data = await res.json();
        setResults(data.leads ?? []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, orgId]);

  // Close on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectLead(lead: LeadResult) {
    setQuery("");
    setOpen(false);
    router.push(`/org/${orgSlug}/leads/${lead.id}`);
  }

  function clearQuery() {
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  const igHandle = (lead: LeadResult) => {
    const h = lead.metadata?.instagram_handle as string | null;
    if (h) return h.startsWith("@") ? h : `@${h}`;
    if (lead.channel === "instagram") {
      const clean = lead.external_id.replace(/^ig_/, "").replace(/_[0-9a-f]{8}$/, "");
      if (clean && !clean.startsWith("manual_")) return `@${clean}`;
    }
    return null;
  };
  const phone = (lead: LeadResult) => lead.metadata?.phone as string | null ?? null;

  return (
    <div ref={dropRef} className="relative w-full max-w-xl">
      {/* Search input */}
      <div className={cn(
        "flex items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--bg-2)] px-3",
        open ? "border-[var(--brand)] ring-1 ring-[var(--brand)]/30" : "border-[var(--border)]",
        "transition-all duration-[120ms]"
      )}>
        {loading
          ? <Loader2 className="h-4 w-4 shrink-0 text-[var(--text-3)] animate-spin" />
          : <Search className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          placeholder={placeholder}
          className="flex-1 bg-transparent py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none"
          aria-label="Search leads"
          autoComplete="off"
        />
        {query && (
          <button type="button" onClick={clearQuery} className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)] transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {open && results.length > 0 && (
        <div className={cn(
          "absolute left-0 right-0 top-[calc(100%+4px)] z-50",
          "rounded-[var(--radius-md)] border border-[var(--border)]",
          "bg-[var(--bg-1)] shadow-elevated overflow-hidden"
        )}>
          {results.map((lead) => {
            const ig   = igHandle(lead);
            const ph   = phone(lead);
            const isCurrent = lead.id === selectedId;
            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => selectLead(lead)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3",
                  "text-left transition-colors duration-[100ms]",
                  isCurrent
                    ? "bg-[var(--brand)]/8 border-l-2 border-[var(--brand)]"
                    : "hover:bg-[var(--bg-3)] border-l-2 border-transparent"
                )}
              >
                {/* Avatar / initial */}
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  lead.score >= 75 ? "bg-red-500/20 text-red-400"
                  : lead.score >= 50 ? "bg-amber-500/20 text-amber-400"
                  : "bg-[var(--bg-3)] text-[var(--text-3)]"
                )}>
                  {lead.avatar_url
                    ? <img src={lead.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                    : (lead.name ?? lead.external_id).slice(0, 2).toUpperCase()
                  }
                </div>

                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text)] truncate">
                      {lead.name ?? lead.external_id}
                    </span>
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      STAGE_DOT[lead.stage] ?? "bg-[var(--bg-3)]"
                    )} />
                    <span className="text-[11px] text-[var(--text-3)] capitalize shrink-0">
                      {lead.stage.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)]">
                    {ig && <span className="flex items-center gap-0.5 truncate"><Instagram className="h-2.5 w-2.5" />{ig}</span>}
                    {ph && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{ph}</span>}
                    {!ig && !ph && <span className="truncate">{lead.channel}</span>}
                  </div>
                </div>

                {/* Score */}
                {lead.score > 0 && (
                  <span className={cn(
                    "text-xs font-mono font-semibold shrink-0",
                    lead.score >= 75 ? "text-red-400" : lead.score >= 50 ? "text-amber-400" : "text-[var(--text-3)]"
                  )}>
                    {lead.score}
                  </span>
                )}
              </button>
            );
          })}

          {/* No more results hint */}
          <div className="px-4 py-2 border-t border-[var(--border)] text-[11px] text-[var(--text-3)]">
            Showing {results.length} result{results.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Empty state when search has text but no results */}
      {open && results.length === 0 && query.trim() && !loading && (
        <div className={cn(
          "absolute left-0 right-0 top-[calc(100%+4px)] z-50",
          "rounded-[var(--radius-md)] border border-[var(--border)]",
          "bg-[var(--bg-1)] shadow-elevated px-4 py-6 text-center"
        )}>
          <UserCircle className="h-8 w-8 text-[var(--text-3)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-3)]">No leads match &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-[var(--text-3)] mt-0.5">Try searching by name, Instagram handle, or phone</p>
        </div>
      )}
    </div>
  );
}
