"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: Props) {
  React.useEffect(() => {
    console.error("[root/error]", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 py-16 text-center font-sans">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/8">
            <AlertTriangle className="h-7 w-7 text-red-400" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <p className="text-base font-semibold">Something went wrong</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              An unexpected error occurred. Your data is safe — refreshing usually fixes it.
            </p>
            {error.digest && (
              <p className="font-mono text-[10px] text-gray-400">ref: {error.digest}</p>
            )}
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh and retry
          </button>
        </div>
      </body>
    </html>
  );
}
