import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-sm)] bg-[var(--bg-3)]",
        className
      )}
      {...props}
    />
  );
}

/** Pre-built metric tile skeleton */
function MetricTileSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-2)] p-5 space-y-3", className)}>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/** Table row skeleton */
function TableRowSkeleton({ cols = 4, className }: { cols?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 py-3 border-b border-[var(--border)]", className)}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-3 flex-1" />
      ))}
    </div>
  );
}

export { Skeleton, MetricTileSkeleton, TableRowSkeleton };
