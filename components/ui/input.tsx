import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional left icon element */
  leftIcon?: React.ReactNode;
  /** Optional right element (icon, button, etc.) */
  rightElement?: React.ReactNode;
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightElement, error, ...props }, ref) => {
    if (leftIcon || rightElement) {
      return (
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 text-[var(--text-3)] pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            type={type}
            ref={ref}
            className={cn(
              inputBase,
              leftIcon && "pl-9",
              rightElement && "pr-9",
              error && inputError,
              className
            )}
            {...props}
          />
          {rightElement && (
            <span className="absolute right-3 text-[var(--text-3)]">
              {rightElement}
            </span>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        ref={ref}
        className={cn(inputBase, error && inputError, className)}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

const inputBase =
  "h-9 w-full rounded-[var(--radius-sm)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] border border-[var(--border)] transition-colors duration-[160ms] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-0 focus-visible:border-[var(--brand)] " +
  "hover:border-[var(--border-strong)] " +
  "disabled:cursor-not-allowed disabled:opacity-40 " +
  "file:border-0 file:bg-transparent file:text-sm file:font-medium";

const inputError =
  "border-[var(--danger)] focus-visible:ring-[var(--danger)]";

export { Input };
