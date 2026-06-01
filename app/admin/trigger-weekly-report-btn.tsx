"use client";

import * as React from "react";
import { Loader2, Mail } from "lucide-react";

export function TriggerWeeklyReportBtn() {
  const [loading,  setLoading]  = React.useState(false);
  const [result,   setResult]   = React.useState<string | null>(null);

  async function trigger() {
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch("/api/admin/trigger-weekly-report", { method: "POST" });
      const data = await res.json();
      setResult(data.message ?? (res.ok ? "Triggered!" : data.error ?? "Error"));
    } catch {
      setResult("Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={trigger}
        disabled={loading}
        className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        Trigger weekly report now
      </button>
      {result && <span className="text-xs text-[var(--text-3)]">{result}</span>}
    </div>
  );
}
