import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:     "bg-[var(--bg-3)] text-[var(--text-2)] border border-[var(--border)]",
        brand:       "bg-[var(--brand)] text-[#0A0A0C]",
        "brand-outline": "border border-[var(--brand)] text-[var(--brand)] bg-transparent",
        warn:        "bg-[rgba(246,184,96,0.12)] text-[var(--warn)] border border-[rgba(246,184,96,0.25)]",
        danger:      "bg-[rgba(255,93,93,0.12)] text-[var(--danger)] border border-[rgba(255,93,93,0.25)]",
        muted:       "bg-[var(--bg-3)] text-[var(--text-3)] border border-[var(--border)]",
        /* Lead-score variants */
        hot:         "bg-[var(--brand)] text-[#0A0A0C] shadow-[0_0_8px_var(--brand-glow)]",
        warm:        "border border-[var(--warn)] text-[var(--warn)] bg-transparent",
        cold:        "border border-[var(--bg-3)] text-[var(--text-3)] bg-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
