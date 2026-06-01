"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: Props) {
  React.useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/8">
        <AlertTriangle className="h-7 w-7 text-red-400" />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <p className="font-display text-base font-semibold text-[var(--text)]">
          Something went wrong
        </p>
        <p className="text-sm text-[var(--text-3)] leading-relaxed">
          An unexpected error occurred. Your data is safe — refreshing will restore the page.
        </p>
        {error.digest && (
          <p className="font-mono text-[10px] text-[var(--text-3)] opacity-50">ref: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Refresh and retry
      </button>
    </div>
  );
}
