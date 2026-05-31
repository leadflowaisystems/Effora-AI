import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--bg-1)] px-8 py-16 text-center",
        className
      )}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-3)] text-[var(--text-3)]">
          {icon}
        </div>
      )}
      <div className="space-y-1.5 max-w-xs">
        <p className="font-display text-sm font-semibold text-[var(--text)]">{title}</p>
        {description && (
          <p className="text-sm text-[var(--text-3)] leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
