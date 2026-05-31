import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[80px] w-full rounded-[var(--radius-sm)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] border border-[var(--border)] resize-y transition-colors duration-[160ms]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:border-[var(--brand)]",
          "hover:border-[var(--border-strong)]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          error && "border-[var(--danger)] focus-visible:ring-[var(--danger)]",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
