import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type IntegrationStatus =
  | "active"      // connected, green
  | "connected"   // stored keys, not actively used yet
  | "error"       // keys stored but test failed
  | "disconnected" // never connected
  | "coming_soon"; // provider not yet live

interface HealthCardProps {
  icon: React.ReactNode;
  name: string;
  provider: string;
  status: IntegrationStatus;
  statusLabel?: string;
  description?: string;
  meta?: string;           // e.g. "Last synced 2 min ago"
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}

const statusConfig: Record<
  IntegrationStatus,
  { dot: string; label: string; badgeVariant: "brand" | "warn" | "danger" | "muted" | "default" }
> = {
  active:       { dot: "bg-[var(--brand)]",  label: "Active",       badgeVariant: "brand"   },
  connected:    { dot: "bg-[var(--brand)]",  label: "Connected",    badgeVariant: "brand"   },
  error:        { dot: "bg-[var(--danger)]", label: "Error",        badgeVariant: "danger"  },
  disconnected: { dot: "bg-[var(--text-3)]", label: "Not connected",badgeVariant: "muted"   },
  coming_soon:  { dot: "bg-[var(--text-3)]", label: "Coming soon",  badgeVariant: "muted"   },
};

export function HealthCard({
  icon,
  name,
  provider,
  status,
  statusLabel,
  description,
  meta,
  actionLabel,
  actionHref,
  className,
}: HealthCardProps) {
  const cfg = statusConfig[status];
  const isHealthy = status === "active" || status === "connected";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--bg-2)] p-5 space-y-4 transition-all duration-[160ms]",
        isHealthy
          ? "border-[var(--border)] hover:border-[var(--brand)] hover:shadow-jade"
          : status === "error"
          ? "border-[rgba(255,93,93,0.3)] bg-[rgba(255,93,93,0.04)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]",
        className
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Icon badge */}
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
              isHealthy ? "bg-[rgba(54,230,160,0.1)] text-[var(--brand)]" : "bg-[var(--bg-3)] text-[var(--text-3)]"
            )}
          >
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text)]">{name}</p>
            <p className="text-[11px] text-[var(--text-3)] font-mono">{provider}</p>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
              cfg.dot,
              isHealthy && "shadow-[0_0_6px_var(--brand)]"
            )}
          />
          <Badge variant={cfg.badgeVariant} className="text-[10px] py-0.5">
            {statusLabel ?? cfg.label}
          </Badge>
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-[var(--text-3)] leading-relaxed">{description}</p>
      )}

      {/* Meta */}
      {meta && (
        <p className="text-[11px] font-mono text-[var(--text-3)]">{meta}</p>
      )}

      {/* Action */}
      {actionLabel && actionHref && (
        <div className="pt-1">
          <Button
            asChild
            variant={isHealthy ? "ghost" : "secondary"}
            size="sm"
            className="w-full"
          >
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
